<?php
require __DIR__.'/db.php';

if (!isset($_SESSION['uid'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Not logged in']);
    exit;
}

$stmt = $pdo->prepare("
  SELECT id,input_format,output_format,input_text,output_text,settings,created_at
  FROM conversions
  WHERE user_id = ?
  ORDER BY id DESC
");
$stmt->execute([$_SESSION['uid']]);
echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
