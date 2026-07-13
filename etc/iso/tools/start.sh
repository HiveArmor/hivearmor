#!/bin/bash
cd /home/hivearmor/
rm installer
wget http://github.com/encryptshellorg/hivearmor/releases/latest/download/installer
chmod +x installer
./installer
