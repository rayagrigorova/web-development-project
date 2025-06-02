<?php
require __DIR__.'/db.php';

if (!isset($_SESSION['uid'])) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthenticated']);
    exit;
}

$stmt = $pdo->prepare('SELECT id, email FROM users WHERE id = ?');
$stmt->execute([$_SESSION['uid']]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

echo json_encode($user);
