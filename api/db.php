<?php
session_start();
header('Content-Type: application/json');

try {
    $pdo = new PDO(
        'mysql:host=localhost;dbname=converter;charset=utf8mb4',
        'root',            // ← adjust user / pass
        '',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'DB connection failed']);
    exit;
}
