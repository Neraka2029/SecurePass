<?php
// API pour récupérer les identifiants d'un domaine - Version corrigée
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Auth-Token, Authorization');
header('Content-Type: application/json');

// Gérer les requêtes preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

session_start();

// Vérifier l'authentification
if (!isset($_SESSION['username']) || empty($_SESSION['username'])) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error' => 'Utilisateur non authentifié'
    ]);
    exit;
}

$authenticatedUsername = $_SESSION['username'];

// Récupérer le paramètre domain
$domain = $_GET['domain'] ?? '';

if (empty($domain)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Paramètre domain manquant'
    ]);
    exit;
}

// Clé et IV pour le déchiffrement AES-256-CBC
define('ENCRYPTION_KEY', 'MaCléSecrèteDe32Caractères!!'); // 32 caractères
define('ENCRYPTION_IV', '1234567890123456'); // 16 caractères

// Fonction pour déchiffrer un mot de passe
function decryptPassword($encryptedPassword) {
    return openssl_decrypt($encryptedPassword, "AES-256-CBC", ENCRYPTION_KEY, 0, ENCRYPTION_IV);
}

// Connexion à la base de données
$servername = "localhost";
$username_db = "u387960147_localhost";
$password_db = "1Ct#0u~8NM";
$dbname = "u387960147_securepass";

try {
    $conn = new PDO("mysql:host=$servername;dbname=$dbname;charset=utf8", $username_db, $password_db);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Recherche des identifiants pour ce domaine et cet utilisateur
    $stmt = $conn->prepare("
        SELECT idCompte, usernamePageWeb, passwordCompte, email, dateCreation 
        FROM compte 
        WHERE username = ? AND urlPageWeb = ?
        ORDER BY dateCreation DESC
        LIMIT 1
    ");
    $stmt->execute([$authenticatedUsername, $domain]);
    $credentials = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($credentials) {
        // Déchiffrer le mot de passe
        $decryptedPassword = decryptPassword($credentials['passwordCompte']);
        
        if ($decryptedPassword === false) {
            throw new Exception("Erreur lors du déchiffrement du mot de passe");
        }
        
        echo json_encode([
            'success' => true,
            'credentials' => [
                'idCompte' => $credentials['idCompte'],
                'username' => $credentials['usernamePageWeb'],
                'email' => $credentials['email'],
                'password' => $decryptedPassword,
                'compte' => $domain,
                'dateCreation' => $credentials['dateCreation']
            ]
        ]);
    } else {
        echo json_encode([
            'success' => true,
            'credentials' => null,
            'message' => 'Aucun identifiant trouvé pour ce domaine'
        ]);
    }

} catch (PDOException $e) {
    error_log("Erreur SQL get_credentials: " . $e->getMessage());
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Erreur de base de données: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    error_log("Erreur générale get_credentials: " . $e->getMessage());
    
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Erreur lors de la récupération: ' . $e->getMessage()
    ]);
} finally {
    $conn = null;
}
?>