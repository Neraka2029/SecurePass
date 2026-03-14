<?php
// Configuration des logs PHP
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/logs/php_errors.log');

// Test simple pour vérifier l'exécution
file_put_contents(__DIR__ . '/test_execution.txt', 'Le script PHP a été exécuté le ' . date('Y-m-d H:i:s') . PHP_EOL, FILE_APPEND);

// API pour sauvegarder les mots de passe - SecurePass Extension
header('Access-Control-Allow-Origin: https://cornflowerblue-dog-952254.hostingersite.com');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Auth-Token, Authorization');
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

// Gérer les requêtes preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Configuration de la session
session_start();

// Vérifier l'authentification
if (!isset($_SESSION['username']) || empty($_SESSION['username'])) {
    logDebug("Utilisateur non authentifié", ['session' => $_SESSION]);
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error' => 'Utilisateur non authentifié'
    ]);
    exit;
}

$authenticatedUsername = $_SESSION['username'];
logDebug("Utilisateur authentifié", ['username' => $authenticatedUsername]);

// Vérifier la méthode HTTP
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'error' => 'Méthode non autorisée. Utilisez POST.'
    ]);
    exit;
}

// Lire les données JSON
$input = file_get_contents('php://input');
logDebug('Reception des données', ['raw_input' => $input]);

$data = json_decode($input, true);

// Vérifier les données
if (json_last_error() !== JSON_ERROR_NONE || !$data) {
    logDebug('Erreur JSON', [
        'error' => json_last_error_msg(),
        'raw_input' => $input,
        'decoded' => $data
    ]);
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Données JSON invalides: ' . json_last_error_msg()
    ]);
    exit;
}

// Vérifier les champs requis
$requiredFields = ['urlPageWeb', 'usernamePageWeb', 'passwordCompte'];
$missingFields = array_filter($requiredFields, function($field) use ($data) {
    return !isset($data[$field]) || empty($data[$field]);
});

if (!empty($missingFields)) {
    logDebug('Champs manquants', ['missing_fields' => $missingFields, 'received_data' => $data]);
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Champs manquants: ' . implode(', ', $missingFields)
    ]);
    exit;
}

// Préparer les données pour l'insertion
$urlPageWeb = $data['urlPageWeb'];
$usernamePageWeb = $data['usernamePageWeb'];
$email = isset($data['email']) ? $data['email'] : '';
$passwordCompte = $data['passwordCompte'];

// Log des données reçues
logDebug('Données reçues validées', [
    'url' => $urlPageWeb,
    'username' => $usernamePageWeb,
    'email' => $email,
    'has_password' => !empty($passwordCompte)
]);

// Connexion à la base de données
$servername = "localhost";
$username_db = "u387960147_localhost";
$password_db = "1Ct#0u~8NM";
$dbname = "u387960147_securepass";

try {
    $conn = new PDO("mysql:host=$servername;dbname=$dbname;charset=utf8", $username_db, $password_db);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    logDebug("Connexion à la base de données réussie");
} catch (PDOException $e) {
    logDebug("Erreur de connexion à la base de données", $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Champs manquants: ' . implode(', ', $missingFields)
    ]);
    exit;
}

// Préparer les données pour l'insertion
try {
    $urlPageWeb = trim($data['urlPageWeb']);
    $usernamePageWeb = trim($data['usernamePageWeb']);
    $email = isset($data['email']) ? trim($data['email']) : '';
    $passwordCompte = $data['passwordCompte'];

    logDebug("Données préparées", [
        'url' => $urlPageWeb,
        'username' => $usernamePageWeb,
        'email' => $email,
        'password_length' => strlen($passwordCompte)
    ]);

    // Vérifier si un compte existe déjà pour ce domaine et cet utilisateur
    $stmt = $conn->prepare("SELECT COUNT(*) as count FROM compte WHERE username = ? AND urlPageWeb = ?");
    $stmt->execute([$authenticatedUsername, $urlPageWeb]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    logDebug('Vérification de compte existant', [
        'username' => $authenticatedUsername,
        'url' => $urlPageWeb,
        'existing' => $existing['count'] > 0
    ]);

    // Vérifier le mot de passe avant chiffrement
    if (empty($passwordCompte)) {
        logDebug('⚠️ Mot de passe vide reçu', [
            'url' => $urlPageWeb,
            'username' => $usernamePageWeb,
            'has_password' => !empty($passwordCompte)
        ]);
        throw new Exception('Mot de passe vide ou non défini');
    }

    logDebug('🔒 Mot de passe reçu', [
        'length' => strlen($passwordCompte),
        'has_special_chars' => preg_match('/[!@#$%^&*(),.?":{}|<>]/', $passwordCompte) !== false
    ]);

    // Chiffrer le mot de passe
    $encryptedPassword = encryptPassword($passwordCompte);
    if (!$encryptedPassword) {
        logDebug('❌ Échec du chiffrement', [
            'error' => 'La fonction encryptPassword a échoué'
        ]);
        throw new Exception('Erreur de chiffrement du mot de passe');
    }

    logDebug('🔒 Mot de passe chiffré', [
        'length' => strlen($encryptedPassword),
        'is_encrypted' => true
    ]);

    // Préparer la requête SQL
    $sql = "INSERT INTO compte 
        (username, urlPageWeb, usernamePageWeb, email, passwordCompte) 
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
        usernamePageWeb = VALUES(usernamePageWeb),
        email = VALUES(email),
        passwordCompte = VALUES(passwordCompte)";
    
    logDebug('Requête SQL préparée', ['sql' => $sql]);
    
    $stmt = $conn->prepare($sql);
    
    // Exécuter la requête
    $result = $stmt->execute([
        $authenticatedUsername,
        $urlPageWeb,
        $usernamePageWeb,
        $email,
        $encryptedPassword
    ]);

    $errorInfo = $stmt->errorInfo();
    logDebug('Résultat de l\'exécution', [
        'result' => $result,
        'affected_rows' => $stmt->rowCount(),
        'error_info' => $errorInfo
    ]);

    if ($result) {
        logDebug("Sauvegarde réussie", [
            'url' => $urlPageWeb,
            'username' => $usernamePageWeb,
            'affected_rows' => $stmt->rowCount()
        ]);
        echo json_encode([
            'success' => true,
            'message' => 'Sauvegarde réussie',
            'affected_rows' => $stmt->rowCount()
        ]);
    } else {
        throw new Exception('Erreur lors de l\'insertion dans la base de données: ' . json_encode($errorInfo));
    }
} catch (PDOException $e) {
    logDebug("Erreur PDO", [
        'error' => $e->getMessage(),
        'code' => $e->getCode(),
        'sqlstate' => $e->getSQLState(),
        'error_info' => $e->errorInfo
    ]);
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Erreur PDO: ' . $e->getMessage(),
        'details' => [
            'code' => $e->getCode(),
            'sqlstate' => $e->getSQLState(),
            'error_info' => $e->errorInfo
        ]
    ]);
} catch (Exception $e) {
    logDebug("Erreur générale", [
        'error' => $e->getMessage(),
        'code' => $e->getCode()
    ]);
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Erreur lors de la sauvegarde: ' . $e->getMessage(),
        'details' => [
            'code' => $e->getCode()
        ]
    ]);
} finally {
    if ($conn) {
        $conn = null;
    }
}

session_start();

// Fonction de logging pour debug
function logDebug($message, $data = []) {
    $timestamp = date('Y-m-d H:i:s');
    $logMessage = "[$timestamp] $message\n";
    
    if (!empty($data)) {
        $logMessage .= "Data: " . json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
    }
    
    // Écrire dans les logs PHP standards
    error_log($logMessage);
}

// Clé de chiffrement fixe (32 caractères pour AES-256)
$encryption_key = "votre_clé_32_caractères_ici";

// Fonction pour chiffrer un mot de passe
function encryptPassword($password) {
    global $encryption_key;
    
    if (empty($password)) {
        logDebug('❌ Mot de passe vide dans encryptPassword', [
            'password_length' => strlen($password)
        ]);
        return false;
    }
    
    try {
        $iv = random_bytes(16);
        $encrypted = openssl_encrypt(
            $password,
            'AES-256-CBC',
            $encryption_key,
            OPENSSL_RAW_DATA,
            $iv
        );
        
        if ($encrypted === false) {
            logDebug('❌ Échec de openssl_encrypt', [
                'error' => openssl_error_string()
            ]);
            return false;
        }
        
        $result = base64_encode($iv . $encrypted);
        logDebug('🔒 Chiffrement réussi', [
            'original_length' => strlen($password),
            'encrypted_length' => strlen($result)
        ]);
        
        return $result;
    } catch (Exception $e) {
        logDebug('❌ Exception dans encryptPassword', [
            'error' => $e->getMessage(),
            'code' => $e->getCode()
        ]);
        return false;
    }
}

// Fonction pour déchiffrer un mot de passe
function decryptPassword($encryptedData) {
    $data = base64_decode($encryptedData);
    if ($data === false || strlen($data) < 16) {
        return false;
    }
    $iv = substr($data, 0, 16);
    $encrypted = substr($data, 16);
    return openssl_decrypt($encrypted, "AES-256-CBC", ENCRYPTION_KEY, OPENSSL_RAW_DATA, $iv);
}

// Connexion à la base de données
$servername = "localhost";
$username_db = "u387960147_localhost";
$password_db = "1Ct#0u~8NM";
$dbname = "u387960147_securepass";

try {
    $conn = new PDO("mysql:host=$servername;dbname=$dbname;charset=utf8", $username_db, $password_db);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    logDebug("Connexion à la base de données réussie");
} catch (PDOException $e) {
    logDebug("Erreur de connexion à la base de données", $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Erreur de connexion à la base de données'
    ]);
    exit;
}

// Vérifier l'authentification
if (!isset($_SESSION['username']) || empty($_SESSION['username'])) {
    logDebug("Utilisateur non authentifié", ['session' => $_SESSION]);
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error' => 'Utilisateur non authentifié'
    ]);
    exit;
}

$authenticatedUsername = $_SESSION['username'];
logDebug("Utilisateur authentifié", ['username' => $authenticatedUsername]);

// Vérifier la méthode HTTP
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'error' => 'Méthode non autorisée. Utilisez POST.'
    ]);
    exit;
}

// Préparer les données pour l'insertion
$urlPageWeb = $data['urlPageWeb'];
$usernamePageWeb = $data['usernamePageWeb'];
$email = isset($data['email']) ? $data['email'] : '';
$passwordCompte = $data['passwordCompte'];
// Nettoyer et préparer les données
$urlPageWeb = trim(strval($data['urlPageWeb']));
$usernamePageWeb = trim(strval($data['usernamePageWeb']));
$passwordCompte = trim(strval($data['passwordCompte']));
$email = isset($data['email']) ? trim(strval($data['email'])) : '';

logDebug('Données nettoyées', [
    'urlPageWeb' => $urlPageWeb,
    'usernamePageWeb' => $usernamePageWeb,
    'email' => $email,
    'passwordLength' => strlen($passwordCompte)
]);

// Validation supplémentaire
if (strlen($passwordCompte) < 6) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Le mot de passe doit contenir au moins 6 caractères'
    ]);
    exit;
}

// Chiffrer le mot de passe
logDebug('Chiffrement du mot de passe en cours');
$encryptedPassword = encryptPassword($passwordCompte);

if ($encryptedPassword === false) {
    logDebug("Erreur de chiffrement du mot de passe");
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Erreur lors du chiffrement du mot de passe'
    ]);
    exit;
}

logDebug("Mot de passe chiffré avec succès", ['length' => strlen($encryptedPassword)]);

try {
    // Vérifier si un compte existe déjà pour ce domaine et cet utilisateur
    logDebug('Vérification de compte existant', [
        'username' => $authenticatedUsername,
        'urlPageWeb' => $urlPageWeb
    ]);
    
    $checkStmt = $conn->prepare(
        "SELECT idCompte FROM compte 
        WHERE username = ? AND urlPageWeb = ?"
    );
    
    $checkStmt->execute([$authenticatedUsername, $urlPageWeb]);
    $existingAccount = $checkStmt->fetch(PDO::FETCH_ASSOC);
    
    if ($existingAccount) {
        // Mettre à jour le compte existant
        logDebug('Mise à jour du compte existant', ['idCompte' => $existingAccount['idCompte']]);
        
        $updateStmt = $conn->prepare(
            "UPDATE compte 
            SET usernamePageWeb = ?, passwordCompte = ?, email = ?, 
                dateMaj = CURRENT_TIMESTAMP
            WHERE username = ? AND urlPageWeb = ?"
        );
        
        $success = $updateStmt->execute([
            $usernamePageWeb,
            $encryptedPassword,
            $email,
            $authenticatedUsername,
            $urlPageWeb
        ]);

        if ($success) {
            logDebug("Compte mis à jour avec succès", [
                'idCompte' => $existingAccount['idCompte'],
                'rowsAffected' => $updateStmt->rowCount()
            ]);
            
            echo json_encode([
                'success' => true,
                'action' => 'updated',
                'message' => 'Identifiants mis à jour avec succès',
                'data' => [
                    'idCompte' => $existingAccount['idCompte'],
                    'urlPageWeb' => $urlPageWeb,
                    'usernamePageWeb' => $usernamePageWeb,
                    'email' => $email
                ]
            ]);
        } else {
            throw new Exception("Échec de la mise à jour");
        }
    } else {
        // Créer un nouveau compte
        logDebug('Création d\'un nouveau compte');
        
        $insertStmt = $conn->prepare(
            "INSERT INTO compte (username, urlPageWeb, usernamePageWeb, passwordCompte, email, dateCreation) 
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
        );
        
        $success = $insertStmt->execute([
            $authenticatedUsername,
            $urlPageWeb,
            $usernamePageWeb,
            $encryptedPassword,
            $email
        ]);

        if ($success) {
            $newId = $conn->lastInsertId();
            
            logDebug("Nouveau compte créé avec succès", [
                'idCompte' => $newId
            ]);
            
            echo json_encode([
                'success' => true,
                'action' => 'created',
                'message' => 'Identifiants sauvegardés avec succès',
                'data' => [
                    'idCompte' => $newId,
                    'urlPageWeb' => $urlPageWeb,
                    'usernamePageWeb' => $usernamePageWeb,
                    'email' => $email
                ]
            ]);
        } else {
            throw new Exception("Échec de l'insertion");
        }
    }

} catch (PDOException $e) {
    logDebug("Erreur SQL", [
        'error' => $e->getMessage(),
        'code' => $e->getCode()
    ]);
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Erreur lors de la sauvegarde: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    logDebug("Erreur générale", $e->getMessage());
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Erreur lors de la sauvegarde: ' . $e->getMessage()
    ]);
} finally {
    $conn = null;
}
?>