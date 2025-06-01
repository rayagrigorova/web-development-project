<?php
require __DIR__.'/db.php';

$data = json_decode(file_get_contents('php://input'), true);
$email    = trim($data['email']    ?? '');
$password = trim($data['password'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 6) {
    http_response_code(422);
    echo json_encode(['error' => 'Невалиден e-mail или прекалено къса парола (мин. 6).']);
    exit;
}

$stmt = $pdo->prepare('SELECT 1 FROM users WHERE email = ?');
$stmt->execute([$email]);
if ($stmt->fetch()) {
    http_response_code(409);
    echo json_encode(['error' => 'Този e-mail вече съществува.']);
    exit;
}

$hash = password_hash($password, PASSWORD_DEFAULT);
$pdo->prepare('INSERT INTO users (email,password_hash) VALUES (?,?)')
    ->execute([$email, $hash]);

$_SESSION['uid'] = $pdo->lastInsertId();
session_regenerate_id(true);

echo json_encode(['ok' => true]);