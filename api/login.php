<?php
require __DIR__.'/db.php';

error_log(__FILE__.' '.session_id().' uid='.($_SESSION['uid']??'¬'));

$data = json_decode(file_get_contents('php://input'), true);
$email    = trim($data['email']    ?? '');
$password = trim($data['password'] ?? '');

$stmt = $pdo->prepare('SELECT id,password_hash FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if ($user && password_verify($password, $user['password_hash'])) {
    session_regenerate_id(true);
    $_SESSION['uid'] = $user['id'];
    echo json_encode(['ok' => true]);
} else {
    http_response_code(401);
    echo json_encode(['error' => 'Грешен e-mail или парола.']);
}
