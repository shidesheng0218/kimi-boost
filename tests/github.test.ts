import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("tar", () => ({ x: vi.fn(async () => undefined) }));

type FetchMock = ReturnType<typeof vi.fn<(url: string, opts?: { signal: AbortSignal }) => Promise<unknown>>>;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function okResponse() {
  return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) };
}

describe("downloadRepoTarball 网络可靠性", () => {
  it("给 fetch 传入超时 AbortSignal", async () => {
    const fetchMock: FetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { downloadRepoTarball } = await import("../src/core/github.js");
    const dl = await downloadRepoTarball("foo/bar", "main");
    dl.cleanup();
    const opts = fetchMock.mock.calls[0][1] as { signal: AbortSignal };
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    expect(opts.signal.aborted).toBe(false);
  });

  it("branch 404 时换 tag 形态再试", async () => {
    const fetchMock: FetchMock = vi.fn(async (url: string) =>
      url.includes("/refs/heads/") ? { ok: false, status: 404 } : okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { downloadRepoTarball } = await import("../src/core/github.js");
    const dl = await downloadRepoTarball("foo/bar", "v1.0.0");
    dl.cleanup();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("/refs/tags/v1.0.0");
  });

  it("branch 和 tag 都 404:报仓库/ref 不存在,不重试", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const { downloadRepoTarball } = await import("../src/core/github.js");
    await expect(downloadRepoTarball("foo/bar", "nope")).rejects.toThrow(/404/);
    await expect(downloadRepoTarball("foo/bar", "nope")).rejects.toThrow(/不存在/);
    // 每次调用 2 个 URL 各 1 次,共 4 次(404 不重试)
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("网络错误重试 1 次后成功", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("ECONNRESET");
      return okResponse();
    });
    vi.stubGlobal("fetch", fetchMock);
    const { downloadRepoTarball } = await import("../src/core/github.js");
    const dl = await downloadRepoTarball("foo/bar", "main");
    dl.cleanup();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("网络持续失败:每个 URL 重试 1 次,错误信息区分网络问题并附原始 URL", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { downloadRepoTarball } = await import("../src/core/github.js");
    await expect(downloadRepoTarball("foo/bar", "main")).rejects.toThrow(/网络/);
    await expect(downloadRepoTarball("foo/bar", "main")).rejects.toThrow(
      /codeload\.github\.com\/foo\/bar/,
    );
    // 每次调用 2 个 URL × (1 + 1 次重试) = 4
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("非 404 的 HTTP 错误按网络类处理:重试 1 次并在消息中带状态码", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { downloadRepoTarball } = await import("../src/core/github.js");
    await expect(downloadRepoTarball("foo/bar", "main")).rejects.toThrow(/HTTP 500/);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("超时(AbortSignal TimeoutError)按网络错误重试", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new DOMException("The operation timed out", "TimeoutError");
      return okResponse();
    });
    vi.stubGlobal("fetch", fetchMock);
    const { downloadRepoTarball } = await import("../src/core/github.js");
    const dl = await downloadRepoTarball("foo/bar", "main");
    dl.cleanup();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
