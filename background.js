// Service Worker pour l'extension SecurePass

let lastError = null;
let lastErrorTime = 0;
const ERROR_TIMEOUT = 5000;

// Vérification d'authentification
async function checkAuthentication() {
  try {
    const response = await fetch('https://cornflowerblue-dog-952254.hostingersite.com/check_auth.php', {
      method: 'POST',
      credentials: 'include' // ⬅️ Permet d'envoyer les cookies
    });

    const data = await response.json();
    console.log("Réponse brute du serveur:", data);

    if (data.success && data.data?.authenticated) {
      const username = data.data.username || '';
      console.log("✅ Authentifié en tant que:", data.data.username);
      return {
        success: true,
        data: {
          authenticated: true, // ou false
          username
        }
      };
    }

    return {
      success: true,
      data: {
        authenticated: false
      }
    };
  } catch (error) {
    console.error("❌ Erreur technique auth :", error);
    return {
      success: true, // 👈 On évite le rappel forcé si erreur réseau
      data: {
        authenticated: false,
        error: "erreur-technique"
      }
    };
  } 
}

// Récupérer les identifiants
async function getCredentials(domain) {
  console.log("🌐 Récupération des identifiants pour domaine:", domain);
  try {
    const url = `https://cornflowerblue-dog-952254.hostingersite.com/get_credentials.php?domain=${encodeURIComponent(domain)}`;
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-cache',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      const message = `HTTP error! status: ${response.status}, Response: ${errorText}`;
      console.error('❌ Erreur HTTP:', { message });
      throw new Error(message);
    }

    const data = await response.json();
    console.log('Réponse brute du serveur:', JSON.stringify(data, null, 2));

    return {
      success: data.success === true,
      credentials: data.credentials || [],
      error: data.error
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('Erreur récupération identifiants:', message);
    return {
      success: false,
      credentials: [],
      error: message
    };
  }
}

// Sauvegarde mot de passe
async function savePassword(data) {
  try {
    console.log('🎯 Début sauvegarde pour domaine:', data.urlPageWeb);
    console.log('🎯 Données reçues:', JSON.stringify(data, null, 2));

    // Vérification de l'authentification
    console.log('🔍 Vérification de l\'authentification...');
    const sessionCheckData = await checkAuthentication();
    console.log('🔍 Résultat auth:', JSON.stringify(sessionCheckData, null, 2));
    
    if (!sessionCheckData?.success) {
      throw new Error('Non authentifié - Veuillez vous connecter');
    }

    // Récupération du token JWT
    let token = null;
    if (sessionCheckData.data?.token) {
      token = sessionCheckData.data.token;
      console.log('🔑 Token JWT trouvé dans la réponse auth');
    } else {
      // Si pas de token dans la réponse, essayer de le récupérer du stockage
      const storageResult = await chrome.storage.sync.get(['api_token']);
      token = storageResult.api_token;
      console.log('🔍 Token existant:', token ? 'Trouvé' : 'Non trouvé');
    }

    if (!token) {
      throw new Error('Aucun token JWT trouvé - Veuillez vous reconnecter');
    }

    // Préparation des headers
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'SecurePassExtension/1.0',
      'X-Requested-With': 'XMLHttpRequest',
      'Authorization': `Bearer ${token}`
    };

    // Préparation des données à envoyer
    const jsonData = {
      urlPageWeb: data.urlPageWeb || data.url,
      usernamePageWeb: data.usernamePageWeb || data.username,
      passwordCompte: data.password || data.passwordCompte,
      email: data.email || ''
    };
    console.log('🎯 Données JSON:', JSON.stringify(jsonData, null, 2));

    // Configuration de la requête
    const fetchOptions = {
      method: 'POST',
      headers,
      body: JSON.stringify(jsonData),
      credentials: 'include',
      cache: 'no-cache',
      mode: 'cors',
      redirect: 'follow'
    };

    // Utiliser un endpoint de test pour vérifier le routage
    const testUrl = 'https://cornflowerblue-dog-952254.hostingersite.com/test_api.php';
    console.log('📡 Test du routage vers:', testUrl);

    try {
      const testResponse = await fetch(testUrl, fetchOptions);
      const testText = await testResponse.text();
      console.log('🎯 Réponse test:', testText);
      
      if (!testResponse.ok) {
        console.error('❌ Test du routage échoué:', {
          status: testResponse.status,
          response: testText
        });
        throw new Error(`Test du routage échoué: ${testResponse.statusText}`);
      }

      const testResult = JSON.parse(testText);
      console.log('🎯 Résultat test:', testResult);

      // Si le test réussit, continuer avec la sauvegarde
      fetchOptions.url = 'https://cornflowerblue-dog-952254.hostingersite.com/save_password.php';
      console.log('📡 Envoi de la requête de sauvegarde vers:', fetchOptions.url);
      
      const response = await fetch(fetchOptions.url, fetchOptions);
      const text = await response.text();
      console.log('🎯 Réponse brute:', text);

      try {
        const responseData = JSON.parse(text);
        console.log('🎯 Réponse JSON:', JSON.stringify(responseData, null, 2));
        return responseData;
      } catch (jsonError) {
        console.error('❌ Erreur de parsing JSON:', {
          message: jsonError.message,
          response: text
        });
        throw new Error(`Réponse non JSON reçue: ${text.substring(0, 200)}`);
      }
    } catch (error) {
      console.error('❌ Erreur lors du test ou de la sauvegarde:', {
        message: error.message,
        stack: error.stack,
        data: jsonData,
        headers: headers
      });
      throw error;
    }
  } catch (error) {
    console.error('❌ Erreur dans savePassword:', {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Requête avec retry
async function makeRequestWithRetry(options) {
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [1000, 2000, 4000];
  const url = 'https://cornflowerblue-dog-952254.hostingersite.com/save_password.php';
  let responseText = '';

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      console.log(`🎯 Tentative ${attempt + 1} vers ${url}`);
      const response = await fetch(url, options);
      responseText = await response.text();

      if (!response.ok) {
        let errorMessage = `Erreur HTTP ${response.status}`;
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData?.details || errorData?.error || errorMessage;
        } catch {}
        throw new Error(errorMessage);
      }

      if (!responseText.trim()) throw new Error('Réponse vide du serveur');
      if (responseText.trim().startsWith('<')) throw new Error('Réponse HTML reçue au lieu de JSON');

      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (jsonError) {
        throw new Error(`Erreur de parsing JSON: ${jsonError.message}`);
      }

      if (typeof responseData !== 'object' || !('success' in responseData)) {
        throw new Error('Réponse invalide: structure incorrecte');
      }

      console.log('✅ Réponse JSON OK:', responseData);
      return responseData;

    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      console.error(`❌ Erreur tentative ${attempt + 1}:`, message);

      if (attempt === MAX_RETRIES - 1) {
        console.error('❌ Toutes les tentatives échouées:', {
          erreurFinale: message,
          reponse: responseText ? responseText.substring(0, 200) : 'Aucune'
        });
        throw new Error(`Sauvegarde impossible: ${message}`);
      }

      console.log(`⏳ Nouvelle tentative dans ${RETRY_DELAYS[attempt]}ms...`);
      await new Promise(res => setTimeout(res, RETRY_DELAYS[attempt]));
    }
  }
}

// Messages entrants
let cachedAuthCookie = '';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Vérifier si l'extension est active
  if (!chrome.runtime?.id) {
    console.warn('❌ Extension inactive');
    sendResponse({
      success: false,
      error: 'Extension inactive',
      needsReconnect: true
    });
    return true;
  }

  console.log('🎯 Message reçu:', request.action);

  // Vérifier état de l'extension
  if (request.action === "ping") {
    sendResponse({ success: true, message: "Extension active" });
    return true;
  }

  // Vérification d'authentification
  if (request.action === "check_auth" || request.action === "checkAuth") {
    checkAuthentication().then(data => {
      console.log('✅ Résultat de checkAuthentication:', data);
      sendResponse(data);
    }).catch(error => {
      console.error('❌ Erreur dans checkAuthentication:', error);
      sendResponse({
        success: false,
        error: error.message
      });
    });
    return true;
  }

  // Gestion des erreurs récentes
  if (lastError && Date.now() - lastErrorTime < ERROR_TIMEOUT) {
    sendResponse({
      success: false,
      error: lastError.message,
      needsReconnect: true
    });
    return true;
  }

  // Gestion d’erreurs centralisée
  const handleError = (error) => {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    lastError = error;
    lastErrorTime = Date.now();
    sendResponse({
      success: false,
      error: message,
      needsReconnect: message.includes('Extension context invalidated')
    });
  };

  // Récupérer les identifiants stockés
  if (request.action === "getCredentials" || request.action === "isDomainKnown") {
    getCredentials(request.domain)
      .then(sendResponse)
      .catch(handleError);
    return true;
  }

  // Sauvegarde locale ou distante via logique existante
  if (request.action === "savePassword") {
    savePassword(request.data)
      .then(data => sendResponse({ success: true, data }))
      .catch(handleError);
    return true;
  }

  // ✅ Nouvelle action : sauvegarde directe depuis le background (solution CORS)
  if (request.action === "backgroundSave") {
    const data = request.data;

    fetch("https://cornflowerblue-dog-952254.hostingersite.com/save_password.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data),
      credentials: "include"
    })
    .then(response => {
      if (response.ok) {
        console.log("✅ Sauvegarde réussie via backgroundSave");
        sendResponse({ success: true });
      } else {
        console.error("❌ Réponse serveur non OK :", response.status);
        sendResponse({ success: false, error: "Erreur HTTP : " + response.status });
      }
    })
    .catch(error => {
      console.error("❌ Erreur backgroundSave:", error);
      sendResponse({ success: false, error: error.message });
    });

    return true; // ← Important pour réponse asynchrone
  }
});

// Extension installée ou mise à jour
chrome.runtime.onInstalled.addListener((details) => {
  if (['install', 'update'].includes(details.reason)) {
    console.log(`🔔 Extension ${details.reason}`);
  }
});

// Gestion de l'état d'auth via cookies
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (changeInfo.cookie.domain.includes('cornflowerblue-dog-952254.hostingersite.com') &&
      changeInfo.cookie.name === 'securepass_auth') {

    const isAuthenticated = !changeInfo.removed;
    console.log(isAuthenticated ? '🔐 Connecté' : '🚪 Déconnecté');

    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'AUTH_STATE_CHANGED',
          authenticated: isAuthenticated
        }).catch(() => {});
      });
    });
  }
});