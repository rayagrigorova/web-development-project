<?php
require __DIR__.'/db.php';
if (isset($_SESSION['uid'])) {
    echo json_encode(['uid' => $_SESSION['uid']]);
} else {
    http_response_code(401);
    echo json_encode(['error' => 'unauthenticated']);
}
