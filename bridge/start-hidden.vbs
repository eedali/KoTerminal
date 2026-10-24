' KoTerminal bridge without a console window (Windows). Needs Node.js on PATH.
' KoTerminal's "Start bridge" button can run this file: pick it in the KoTerminal settings.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
Set shell = CreateObject("WScript.Shell")
shell.Run "node """ & dir & "\src\cli.js""", 0, False
