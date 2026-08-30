Output "verify.mp4"

Require lexforge

Set Shell "bash"
Set FontSize 16
Set Width 1500
Set Height 800
Set Padding 24
Set TypingSpeed 25ms
Set Theme "Catppuccin Mocha"

Hide
Type "cd examples/notes" Enter
Type "rm -f lexforge/changes/add-search/evidence.json" Enter
Type "export PS1='$ '" Enter
Type "clear" Enter
Show

Sleep 1s
Type "# planned, coded, every box ticked. the agent says the change is done." Enter
Sleep 2s

Type "lexforge verify --change add-search" Enter
Sleep 5s

Type "echo $?" Enter
Sleep 4s

Type "lexforge evidence record --change add-search --label tests" Enter
Sleep 5s

Type "lexforge evidence record --change add-search --label lint" Enter
Sleep 2s

Type "lexforge verify --change add-search" Enter
Sleep 5s

Type "echo $?" Enter
Sleep 5s
