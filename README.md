# SecurePass - Extension Chrome

Extension de navigateur Chrome pour la gestion sécurisée des mots de passe, intégrée avec votre plateforme web hébergée sur Hostinger.

## 🚀 Fonctionnalités

### Détection Automatique
- **Formulaires d'inscription** : Détection intelligente des champs password lors de l'inscription
- **Formulaires de connexion** : Reconnaissance des formulaires existants pour l'auto-remplissage
- **Analyse contextuelle** : Distinction automatique entre inscription et connexion

### Génération de Mots de Passe
- **Mots de passe sécurisés** : Génération automatique avec critères de sécurité avancés
- **Personnalisation** : Longueur configurable (8-32 caractères)
- **Options flexibles** : Majuscules, minuscules, chiffres, symboles
- **Évaluation de force** : Indicateur visuel de la robustesse du mot de passe

### Gestion des Identifiants
- **Sauvegarde automatique** : Stockage sécurisé dans votre base de données MySQL
- **Auto-remplissage intelligent** : Reconnaissance et remplissage automatique des identifiants existants
- **Synchronisation** : Intégration complète avec votre plateforme web SecurePass

### Interface Utilisateur
- **Design moderne** : Interface cohérente avec votre charte graphique
- **Animations fluides** : Micro-interactions et transitions CSS avancées
- **Notifications contextuelles** : Feedback utilisateur en temps réel
- **Responsive** : Adaptation automatique à toutes les tailles d'écran

## 📋 Prérequis

### Serveur Web
- PHP 7.4+ avec PDO MySQL
- Base de données MySQL avec les tables existantes
- Certificat SSL (HTTPS requis pour l'extension)

### Structure de Base de Données
```sql
-- Table utilisateur
CREATE TABLE utilisateur (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    adresse_mail VARCHAR(255) NOT NULL,
    passwordUser VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table compte (identifiants sauvegardés)
CREATE TABLE compte (
    idCompte INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    urlDomaine VARCHAR(255) NOT NULL,
    passwordCompte TEXT NOT NULL,
    dateCreation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    dateModification TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (username) REFERENCES utilisateur(username)
);

-- Table tokens d'authentification
CREATE TABLE auth_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    token TEXT NOT NULL,
    expiration DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_username (username)
);
```

## 🛠️ Installation

### 1. Préparation du Serveur
```bash
# Télécharger les fichiers PHP
curl -O https://your-domain.com/save_password.php
# Assurez-vous que vos fichiers PHP existants sont à jour
```

### 2. Installation de l'Extension

#### Mode Développeur (Test)
1. Ouvrez Chrome et allez à `chrome://extensions/`
2. Activez le "Mode développeur" (coin supérieur droit)
3. Cliquez sur "Charger l'extension non empaquetée"
4. Sélectionnez le dossier contenant les fichiers de l'extension
5. L'extension SecurePass apparaît dans la barre d'outils

#### Publication Chrome Web Store (Production)
1. Créez un compte développeur Chrome (frais unique de 5$)
2. Empaquetez l'extension : `Extensions` → `Empaqueter l'extension`
3. Soumettez le fichier `.crx` au Chrome Web Store
4. Attendez l'approbation (1-3 jours ouvrables)

### 3. Configuration
Modifiez l'URL de votre serveur dans `background.js` et `content.js` si nécessaire :
```javascript
const API_BASE_URL = 'https://cornflowerblue-dog-952254.hostingersite.com';
```

## 📖 Utilisation

### Première Utilisation
1. **Installation** : L'extension s'installe automatiquement dans Chrome
2. **Connexion** : Cliquez sur l'icône SecurePass pour vous connecter
3. **Navigation** : L'extension détecte automatiquement les formulaires

### Inscription sur un Nouveau Site
1. **Détection** : Focalisez un champ password sur un formulaire d'inscription
2. **Suggestion** : Une popup propose un mot de passe sécurisé
3. **Actions disponibles** :
   - **Copier** : Copie le mot de passe dans le presse-papier
   - **Utiliser** : Remplit le champ ET sauvegarde les identifiants
   - **Fermer** : Ferme la popup sans action

### Connexion sur un Site Existant
1. **Reconnaissance** : L'extension détecte vos identifiants sauvegardés
2. **Proposition** : Une popup propose l'auto-remplissage
3. **Remplissage** : Validation automatique des champs username et password

### Gestion via le Popup
- **Générateur intégré** : Créez des mots de passe personnalisés
- **Statut de connexion** : Vérifiez votre état d'authentification
- **Accès rapide** : Lien direct vers votre dashboard SecurePass

## 🔧 Fonctionnalités Techniques

### Architecture
```
SecurePass Extension/
├── manifest.json          # Configuration de l'extension
├── content.js             # Script d'injection dans les pages
├── background.js          # Service worker
├── utils.js              # Fonctions utilitaires
├── styles.css            # Styles pour les popups
├── popup.html/.js/.css   # Interface utilisateur
└── icons/                # Icônes de l'extension
```

### Sécurité
- **Communication HTTPS** : Toutes les requêtes API en HTTPS
- **Authentification par tokens** : Gestion sécurisée des sessions
- **Validation côté serveur** : Vérification de tous les inputs utilisateur
- **Chiffrement** : Recommandation de chiffrement des mots de passe stockés

### Performance
- **Cache intelligent** : Minimisation des appels API
- **Détection optimisée** : Évite les popups en boucle
- **Mémoire efficace** : Nettoyage automatique des ressources

## 🐛 Dépannage

### Problèmes Courants

#### Extension non détectée
```bash
# Vérifiez les permissions dans manifest.json
# Rechargez l'extension dans chrome://extensions/
```

#### Erreurs d'authentification
```php
// Vérifiez les cookies et sessions PHP
// Contrôlez les headers CORS dans vos fichiers PHP
```

#### Popups qui ne s'affichent pas
```javascript
// Vérifiez la console développeur (F12)
// Assurez-vous que les Content Scripts sont chargés
```

### Logs de Débogage
Activez les logs dans la console développeur :
```javascript
// Dans content.js, utils.js et background.js
console.log('🔐 SecurePass Debug:', data);
```

## 🚀 Développement

### Structure du Code
- **Modulaire** : Séparation claire des responsabilités
- **Extensible** : Architecture permettant l'ajout de fonctionnalités
- **Maintenable** : Code documenté et organisé

### Personnalisation
```css
/* Modifier les couleurs dans styles.css */
:root {
  --securepass-primary: #667eea;
  --securepass-secondary: #764ba2;
}
```

```javascript
// Ajuster les paramètres dans utils.js
const API_CONFIG = {
  BASE_URL: 'https://votre-domaine.com',
  // ...
};
```

## 📝 Notes Importantes

### Compatibilité
- **Chrome** : Version 88+
- **Edge** : Chromium-based
- **Opera** : Versions récentes
- **Firefox** : Migration possible avec quelques adaptations

### Limitations
- **Sites HTTPS uniquement** : Recommandé pour la sécurité
- **Domaines spécifiques** : Configuration requise pour nouveaux domaines
- **JavaScript requis** : Fonctionne uniquement si JS est activé

### Recommandations de Sécurité
1. **Chiffrement BDD** : Implémentez le chiffrement des mots de passe stockés
2. **Authentification 2FA** : Intégrez l'authentification à deux facteurs
3. **Audit régulier** : Surveillez les accès et connexions suspectes
4. **Sauvegarde** : Effectuez des sauvegardes régulières de la base de données

## 📞 Support

Pour tout problème technique ou question :
1. Vérifiez la section Dépannage ci-dessus
2. Consultez les logs de la console développeur
3. Contactez votre équipe de développement
4. Documentez les erreurs avec captures d'écran

## 🔄 Mises à Jour

Pour mettre à jour l'extension :
1. **Mode développeur** : Rechargez dans chrome://extensions/
2. **Chrome Web Store** : Les mises à jour sont automatiques
3. **Fichiers serveur** : Mettez à jour vos fichiers PHP si nécessaire

---

**Version** : 1.0.0  
**Dernière mise à jour** : 2025  
**Compatibilité** : Chrome 88+, Edge Chromium, Opera