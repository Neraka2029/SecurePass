// Script pour le popup de l'extension SecurePass
console.log('popup.js chargé');

// Fonction pour vérifier les cookies (optionnel)
function checkCookies() {
  const cookies = document.cookie.split(';').map(cookie => cookie.trim());
  const authCookie = cookies.find(cookie => cookie.startsWith('securepass_auth'));
  console.log('Cookies présents:', cookies);
  console.log('Cookie d\'authentification:', authCookie);
  return authCookie !== undefined;
}

document.addEventListener('DOMContentLoaded', function() {
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const statusDot = statusIndicator.querySelector('.status-dot');
  
  const openWebsiteBtn = document.getElementById('open-website-btn');
  const generatePasswordBtn = document.getElementById('generate-password-btn');
  const passwordGenerator = document.getElementById('password-generator');
  const generatedPasswordInput = document.getElementById('generated-password');
  const copyPasswordBtn = document.getElementById('copy-password-btn');
  const regenerateBtn = document.getElementById('regenerate-btn');
  
  const passwordLengthSlider = document.getElementById('password-length');
  const lengthValue = document.getElementById('length-value');
  
  let currentPassword = '';
  let authCheckInterval;

  // Vérification du statut d'authentification au chargement
  checkAuthenticationStatus();
  authCheckInterval = setInterval(checkAuthenticationStatus, 30000);

  openWebsiteBtn.addEventListener('click', openSecurePassWebsite);

  async function checkAuthenticationStatus() {
    console.log('🎯 popup.js - checkAuthenticationStatus() appelé');
  
    try {
      statusText.textContent = 'Vérification...';
      statusDot.className = 'status-dot';
  
      // Vérifier si l'extension est active
      if (!chrome.runtime?.id) {
        console.warn('❌ Extension inactive');
        statusText.textContent = 'Extension inactive';
        statusDot.classList.add('disconnected');
        openWebsiteBtn.textContent = '🔑 Se connecter';
        showNotification('L\'extension n\'est pas active', 'error');
        return;
      }

      if (!chrome.runtime.sendMessage) {
        throw new Error('Extension non disponible');
      }
  
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "checkAuth" }, resolve);
      });
  
      console.log('✅ Réponse reçue de background.js :', response);
  
      const isAuthenticated = response?.data?.authenticated === true;
  
      if (isAuthenticated) {
        let username = response?.data?.username;
        if (!username || username === "nom_utilisateur") {
          username = "Utilisateur";
        }
        statusText.textContent = `Connecté (${username})`;
        statusDot.classList.add('connected');
        openWebsiteBtn.textContent = '🔓 Tableau de bord';
      } else {
        statusText.textContent = 'Non connecté';
        statusDot.classList.add('disconnected');
        openWebsiteBtn.textContent = '🔑 Se connecter';
      }
  
    } catch (error) {
      console.error('❌ Erreur lors de la vérification:', error);
      statusText.textContent = 'Erreur: ' + error.message;
      statusDot.classList.add('disconnected');
      openWebsiteBtn.textContent = '🔑 Se connecter';
      showNotification('Erreur lors de la vérification de l\'authentification', 'error');
    }
  }
  
  

  function openSecurePassWebsite() {
    chrome.tabs.create({
      url: 'https://cornflowerblue-dog-952254.hostingersite.com/accueil.php'
    });
    window.close();
  }

  function togglePasswordGenerator() {
    const isVisible = passwordGenerator.style.display !== 'none';

    if (isVisible) {
      passwordGenerator.style.display = 'none';
      generatePasswordBtn.innerHTML = `
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17Z"/>
        </svg>
        Générer un mot de passe
      `;
    } else {
      passwordGenerator.style.display = 'block';
      passwordGenerator.classList.add('fade-in');
      generatePasswordBtn.innerHTML = `
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
        </svg>
        Fermer le générateur
      `;
      generateNewPassword();
    }
  }

  function generateNewPassword() {
    const length = parseInt(passwordLengthSlider.value);
    const specialChars = "@?.!*# &$";

    if (length < 8 || length > 16) {
      showNotification('La longueur doit être entre 8 et 16 caractères.', 'error');
      return;
    }

    let password = [
      getRandomChar('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
      getRandomChar('abcdefghijklmnopqrstuvwxyz'),
      getRandomChar('0123456789'),
      getRandomChar(specialChars)
    ];

    const allChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' + specialChars;
    for (let i = 4; i < length; i++) {
      password.push(getRandomChar(allChars));
    }

    shuffleArray(password);
    const finalPassword = password.join('');
    generatedPasswordInput.value = finalPassword;
    currentPassword = finalPassword;
  }

  function getRandomChar(charset) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] / (2 ** 32);
    return charset.charAt(Math.floor(random * charset.length));
  }

  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / (2 ** 32) * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  function copyPassword() {
    if (generatedPasswordInput.value) {
      navigator.clipboard.writeText(generatedPasswordInput.value)
        .then(() => showNotification('Mot de passe copié dans le presse-papiers !', 'success'))
        .catch(() => showNotification('Erreur lors du copiage du mot de passe', 'error'));
    }
  }

  generatePasswordBtn.addEventListener('click', togglePasswordGenerator);
  regenerateBtn.addEventListener('click', generateNewPassword);
  copyPasswordBtn.addEventListener('click', copyPassword);
  passwordLengthSlider.addEventListener('input', (e) => {
    lengthValue.textContent = e.target.value;
    generateNewPassword();
  });

  lengthValue.textContent = passwordLengthSlider.value;
  generateNewPassword();

  document.getElementById('help-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://cornflowerblue-dog-952254.hostingersite.com/help.php' });
    window.close();
  });

  document.getElementById('settings-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://cornflowerblue-dog-952254.hostingersite.com/settings.php' });
    window.close();
  });

  window.addEventListener('unload', () => {
    if (authCheckInterval) clearInterval(authCheckInterval);
  });
});
