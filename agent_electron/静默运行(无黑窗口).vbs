Set WshShell = CreateObject("WScript.Shell")
' 获取当前脚本所在目录
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
' 切换到该目录并静默运行 npm start
WshShell.CurrentDirectory = strPath
WshShell.Run "cmd /c npm start", 0, False
