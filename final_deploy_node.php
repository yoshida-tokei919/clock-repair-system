<?php
header('Content-Type: text/plain; charset=utf-8');

function run($cmd) {
    echo "Executing: $cmd\n";
    $output = shell_exec($cmd . " 2>&1");
    echo $output . "\n" . str_repeat("-", 40) . "\n";
}

$home = "/home/xs493147";
$app_path = "$home/yoshidawatchrepair.com/public_html";
$node_bin = "$home/.nodebrew/current/bin";

echo "--- DEPLOY START ---\n";

// 1. Install Nodebrew if missing
if (!file_exists("$home/.nodebrew")) {
    run("curl -L git.io/nodebrew | perl - setup");
}

// 2. Install Node v20.10.0
run("$node_bin/nodebrew install-binary v20.10.0");
run("$node_bin/nodebrew use v20.10.0");

// 3. NPM Install & Prisma
run("cd $app_path && export PATH=$node_bin:\$PATH && npm install --production");
run("cd $app_path && export PATH=$node_bin:\$PATH && npx prisma db push");

// 4. Start with PM2
run("export PATH=$node_bin:\$PATH && npm install -g pm2");
run("cd $app_path && export PATH=$node_bin:\$PATH && $node_bin/pm2 delete yoshidawatch || true");
run("cd $app_path && export PATH=$node_bin:\$PATH && $node_bin/pm2 start npm --name \"yoshidawatch\" -- start");
run("export PATH=$node_bin:\$PATH && $node_bin/pm2 save");

// 5. Create .htaccess (Reverse Proxy)
$htaccess = "RewriteEngine On\nRewriteCond %{REQUEST_FILENAME} !-f\nRewriteRule ^(.*)$ http://localhost:3000/$1 [P,L]\n";
file_put_contents("$app_path/.htaccess", $htaccess);

echo "\n--- DEPLOY FINISHED ---\n";
?>
