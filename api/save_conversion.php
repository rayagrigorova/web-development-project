<?php
require __DIR__.'/db.php';

if (!isset($_SESSION['uid'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Not logged in']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);

$pdo->prepare("
  INSERT INTO conversions
    (user_id, input_format, output_format, settings, input_text, output_text)
  VALUES (?,?,?,?,?,?)
")->execute([
  $_SESSION['uid'],
  $data['input_format']  ?? null,
  $data['output_format'] ?? null,
  $data['settings']      ?? '',
  $data['input']         ?? '',
  $data['output']        ?? ''
]);

echo json_encode(['ok' => true]);
