---
title: "Paloaltoの電源停止の手順について"
description: "Paloaltoの機器の電源を停止する際は、シャットダウンコマンドを実行した後に電源ケーブルを抜くことが推奨されています。 本記事では、Paloaltoにおいてのシャットダウンの手順について解説します。 ●停止の手順（C…"
pubDatetime: 2025-05-03T11:15:48.000Z
modDatetime: 2025-10-02T14:40:08.000Z
tags: ["Paloalto", "セキュリティ", "ネットワーク", "ファイアウォール"]
ogImage: "../../assets/wp/2025/05/cdb1a7f6-6190-4850-9bb3-834c2edbf4a6-1.png"
---

Paloaltoの機器の電源を停止する際は、シャットダウンコマンドを実行した後に電源ケーブルを抜くことが推奨されています。  
本記事では、Paloaltoにおいてのシャットダウンの手順について解説します。

### ●停止の手順（CLI）

CLIによるコマンド操作でシャットダウンするには以下のコマンドを実行します。

```text
admin@PA-0000> request shutdown system    <--左記のコマンドを実行
Warning: executing this command will leave the system in a shutdown state. Power must be removed and reapplied for the system to restart.  Do you want to continue? (y or n)  <-- [y]を入力

Broadcast message from root (ttyS0) (Thu May  1 23:40:10 2025):Stopping PAN Software: [  OK  ]
Shutting down NFS mountd: [  OK  ]
Shutting down NFS daemon: nfsd: last server has exited, flushing export cache
[  OK  ]
Shutting down NFS services:  [  OK  ]
Stopping xinetd: [  OK  ]
Stopping NFS statd: [  OK  ]
Stopping portmap: [  OK  ]
Shutting down kernel logger: [  OK  ]
Shutting down system logger: [  OK  ]
Stopping Networking: SIOCGIFFLAGS: No such device
[  OK  ]
Starting killall:  Stopping crond: [  OK  ]
Shutting down ntpd: [  OK  ]
Stopping syslog-ng: [  OK  ]
[  OK  ]
Sending all processes the TERM signal...
Sending all processes the KILL signal...
Saving random seed:
Syncing hardware clock to system time
Turning off swap:
Unmounting pipe file systems:
Unmounting file systems:
Halting system...
sd 0:0:0:0: [sda] Synchronizing SCSI cache
sd 0:0:0:0: [sda] Stopping disk
Warning: Freeing of pool 2 is missing 5 buffers
reboot: System halted
```

上記のコマンドにより、最後に「reboot: System halted」と表示されれば、電源ケーブルを引き抜けます。
