<?php
header('Content-Type: text/plain; charset=utf-8');
echo "== PM2 Status ==\n";
echo shell_exec("export PATH=\$HOME/.nodebrew/current/bin:\$PATH; pm2 status 2>&1");
echo "\n== PM2 Logs (Last 50 lines) ==\n";
echo shell_exec("export PATH=\$HOME/.nodebrew/current/bin:\$PATH; pm2 logs yoshida-tokei --lines 50 --no-daemon 2>&1");
?>