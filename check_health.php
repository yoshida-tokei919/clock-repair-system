<?php
header('Content-Type: text/plain; charset=utf-8');

function get_last_lines($file, $lines = 50)
{
    if (!file_exists($file))
        return "File not found: $file\n";
    $data = shell_exec("tail -n $lines " . escapeshellarg($file));
    return $data ?: "(empty)\n";
}

echo "=== System Check ===\n";
echo "Node path: " . shell_exec("export PATH=\$HOME/.nodebrew/current/bin:\$PATH; which node") . "\n";

echo "\n=== PM2 Process List ===\n";
echo shell_exec("export PATH=\$HOME/.nodebrew/current/bin:\$PATH; pm2 jlist");

echo "\n\n=== Error Logs (Last 50 lines) ===\n";
$logFile = $_SERVER['HOME'] . "/.pm2/logs/yoshida-tokei-error.log";
echo "Path: $logFile\n";
echo get_last_lines($logFile);

echo "\n=== Output Logs (Last 50 lines) ===\n";
$outFile = $_SERVER['HOME'] . "/.pm2/logs/yoshida-tokei-out.log";
echo "Path: $outFile\n";
echo get_last_lines($outFile);

echo "\n=== Environment Variable Keys ===\n";
if (file_exists('.env')) {
    $lines = file('.env');
    foreach ($lines as $line) {
        if (trim($line) && strpos($line, '=') !== false && strpos($line, '#') !== 0) {
            list($key, $val) = explode('=', $line, 2);
            echo "$key=" . (strlen(trim($val)) > 4 ? substr(trim($val), 0, 4) . "..." : "***") . "\n";
        }
    }
}
?>