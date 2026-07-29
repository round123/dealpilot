; =============================================================================
;  DealPilot NSIS Installer (per-user, 无需管理员)
;  G1 Spike S1 / AC-25
;
;  用法（由 scripts/build-installer.ps1 调用）:
;    makensis -DAPP_VERSION=0.1.0 -DSTAGING_DIR=<abs> -DOUTPUT_DIR=<abs> installer.nsi
;
;  产物: DealPilot-Setup.exe
;  安装位置: %LOCALAPPDATA%\Programs\DealPilot  (app 二进制 + web 资源)
;  数据位置: %LOCALAPPDATA%\DealPilot            (db/备份/NM manifest，由 Agent 运行时写)
;           — 与安装目录分离，卸载 app 时不误删用户数据
; =============================================================================

!ifndef APP_VERSION
  !define APP_VERSION "0.1.0"
!endif
!ifndef PUBLISHER
  !define PUBLISHER "DealPilot"
!endif
!ifndef STAGING_DIR
  !define STAGING_DIR "..\..\dist\installer-staging"
!endif
!ifndef OUTPUT_DIR
  !define OUTPUT_DIR "..\..\dist"
!endif

Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma

Name "DealPilot"
OutFile "${OUTPUT_DIR}\DealPilot-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\DealPilot"
InstallDirRegKey HKCU "Software\DealPilot" "InstallDir"
RequestExecutionLevel user
ShowInstDetails hide
ShowUnInstDetails hide

; 版本资源（资源管理器 / 属性面板可见）
VIProductVersion "0.1.0.0"
VIAddVersionKey "ProductName" "DealPilot Agent"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "FileDescription" "DealPilot Agent Installer"
VIAddVersionKey "LegalCopyright" "(c) DealPilot"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"

; --------------------------------------------------------------------------
; 页面
; --------------------------------------------------------------------------
Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

; --------------------------------------------------------------------------
; 安装
; --------------------------------------------------------------------------
Section "DealPilot Agent" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"

  ; 主程序
  File "${STAGING_DIR}\app\dealpilot-agent.exe"

  ; NM host manifest 模板（参考；真实 manifest 由 Agent 运行时生成）
  File "${STAGING_DIR}\app\nm-host-template.json"

  ; web 静态资源（递归释放到 $INSTDIR\web）
  File /r "${STAGING_DIR}\app\web"

  ; 数据库迁移文件（编译 exe 运行时从 exe 同级 migrations/ 读取）
  File /r "${STAGING_DIR}\app\migrations"

  ; 安装信息注册表
  WriteRegStr HKCU "Software\DealPilot" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\DealPilot" "Version" "${APP_VERSION}"

  ; Add/Remove Programs (HKCU, per-user)
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DealPilot" "DisplayName" "DealPilot"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DealPilot" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DealPilot" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DealPilot" "DisplayIcon" "$INSTDIR\dealpilot-agent.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DealPilot" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DealPilot" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DealPilot" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DealPilot" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DealPilot" "NoRepair" 1

  ; 快捷方式（Start in 默认为 target 目录）
  CreateShortcut "$DESKTOP\DealPilot.lnk" "$INSTDIR\dealpilot-agent.exe" "" "$INSTDIR\dealpilot-agent.exe" 0
  CreateDirectory "$SMPROGRAMS\DealPilot"
  CreateShortcut "$SMPROGRAMS\DealPilot\DealPilot.lnk" "$INSTDIR\dealpilot-agent.exe" "" "$INSTDIR\dealpilot-agent.exe" 0
  CreateShortcut "$SMPROGRAMS\DealPilot\Uninstall DealPilot.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\uninstall.exe" 0

  ; 卸载器
  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

; --------------------------------------------------------------------------
; 卸载
; --------------------------------------------------------------------------
Section "Uninstall"
  ; app 文件
  Delete "$INSTDIR\dealpilot-agent.exe"
  Delete "$INSTDIR\nm-host-template.json"
  Delete "$INSTDIR\uninstall.exe"
  RMDir /r "$INSTDIR\web"
  RMDir /r "$INSTDIR\migrations"
  RMDir "$INSTDIR"

  ; 快捷方式
  Delete "$DESKTOP\DealPilot.lnk"
  RMDir /r "$SMPROGRAMS\DealPilot"

  ; 安装信息注册表
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DealPilot"
  DeleteRegKey HKCU "Software\DealPilot"

  ; 清理 Agent 运行时注册的 NM 注册表项
  DeleteRegKey HKCU "Software\Google\Chrome\NativeMessagingHosts\com.dealpilot.agent"
  DeleteRegKey HKCU "Software\Microsoft\Edge\NativeMessagingHosts\com.dealpilot.agent"
  ; 删除 Agent 生成的 NM manifest（用户数据默认保留）
  Delete "$LOCALAPPDATA\DealPilot\com.dealpilot.agent.json"

  ; 询问是否删除用户数据（数据库 / 备份）
  MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除 DealPilot 用户数据（数据库、备份）?$\r$\n$\r$\n选择'否'将保留数据，重装后可继续使用。" IDNO SkipData
    RMDir /r "$LOCALAPPDATA\DealPilot"
  SkipData:
SectionEnd
