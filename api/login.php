<?php
require __DIR__.'/db.php';

$data = json_decode(file_get_contents('php://input'), true);
$email    = trim($data['email']    ?? '');
$password = trim($data['password'] ?? '');

$stmt = $pdo->prepare('SELECT id,password_hash FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if ($user && password_verify($password, $user['password_hash'])) {
    $_SESSION['uid'] = $user['id'];
    session_regenerate_id(true);
    echo json_encode(['ok' => true]);
} else {
    http_response_code(401);
    echo json_encode(['error' => 'Грешен e-mail или парола.']);
}

