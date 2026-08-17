Output assets/demo.gif
Set Width 1100
Set Height 640
Set FontSize 15
Set Padding 32
Set TypingSpeed 45ms
Set Theme "Dracula"
Set Framerate 20

Type "mkdir -p ~/demo/vue-app && cd ~/demo/vue-app"
Enter
Sleep 600ms
Type "export KIMI_CODE_HOME=~/demo/.kimi-code"
Enter
Type "export KIMI_BOOST_HOME=~/demo/.kimi-boost"
Enter
Sleep 400ms
Type "kimi-boost list"
Enter
Sleep 1500ms
Type "kimi-boost install"
Enter
Sleep 2000ms
Down
Enter
Sleep 3000ms
Type "cat ~/.kimi-code/config.toml"
Enter
Sleep 2500ms
Type "kimi-boost doctor"
Enter
Sleep 3000ms
Type "kimi-boost remove vue3 --tool kimi"
Enter
Sleep 2000ms
