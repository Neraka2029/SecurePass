// Initialisation de l'extension SecurePass
(function() {
  'use strict';

  let authCheckInProgress = false;

// Système de logging pour le développement
  window.NotificationSystem = {
    show: (message, type) => {
      console.log(`[${type}]`, message);
    }
  };

  // État global de l'extension
  window.SecurePassState = {
    state: {
      isAuthenticated: false,
      currentUsername: '',
      lastAuthCheck: 0,
      activePopup: null,
      dismissedPopup: false,
      lastDismissTime: 0,
      needsReconnect: false,
      saveAttempts: 0,
      maxSaveAttempts: 3,
      lastSaveAttempt: 0,
      saveAttemptTimeout: null
    },
    
    getState() {
      return this.state;
    },
    
    setState(newState) {
      Object.assign(this.state, newState);
    },
    
    resetSaveAttempts() {
      this.setState({ saveAttempts: 0, lastSaveAttempt: 0 });
      if (this.state.saveAttemptTimeout) {
        clearTimeout(this.state.saveAttemptTimeout);
        this.state.saveAttemptTimeout = null;
      }
    },

    incrementSaveAttempts() {
      const now = Date.now();
      if (now - this.state.lastSaveAttempt > 30000) {
        this.resetSaveAttempts();
      }
      this.setState({ saveAttempts: this.state.saveAttempts + 1, lastSaveAttempt: now });
      this.state.saveAttemptTimeout = setTimeout(() => {
        this.resetSaveAttempts();
      }, 30000);
    },

    canAttemptSave() {
      return this.state.saveAttempts < this.state.maxSaveAttempts;
    },
    
    shouldShowPopup() {
      const now = Date.now();
      return !this.state.dismissedPopup || (now - this.state.lastDismissTime) > 300000; // 5 minutes
    },
    dismissPopup() {
      this.state.dismissedPopup = true;
      this.state.lastDismissTime = Date.now();
    },
    clearDismissed() {
      this.state.dismissedPopup = false;
      this.state.lastDismissTime = 0;
    }
  };

  // Utilitaires DOM
  window.DOMUtils = {
    triggerInputEvents(element, value) {
      const events = ['input', 'change', 'keyup', 'keydown'];
      events.forEach(eventType => {
        const event = new Event(eventType, { bubbles: true });
        element.dispatchEvent(event);
      });
    },
  
    // Fonction pour détecter si la page a changé (succès de soumission)
    detectPageChange() {
      return new Promise((resolve) => {
        const initialUrl = window.location.href;
        const initialTitle = document.title;
        let changeDetected = false;
        
        const checkInterval = setInterval(() => {
          if (window.location.href !== initialUrl || document.title !== initialTitle) {
            changeDetected = true;
            clearInterval(checkInterval);
            resolve(true);
          }
        }, 500);
  
        // Timeout après 8 secondes
        setTimeout(() => {
          if (!changeDetected) {
            clearInterval(checkInterval);
            resolve(false);
          }
        }, 8000);
      });
    },
  
    // Détecter les messages d'erreur sur la page
    detectFormErrors() {
      const errorSelectors = [
        '.alert-danger', '.error', '.alert-error', 
        '[class*="error"]', '[class*="danger"]',
        '.field-error', '.form-error', '.invalid-feedback',
        '.text-danger', '.has-error', '.is-invalid'
      ];
      
      for (const selector of errorSelectors) {
        const errorElements = document.querySelectorAll(selector);
        for (const el of errorElements) {
          if (el.offsetHeight > 0 && el.offsetWidth > 0) { // Visible
            const text = el.textContent?.toLowerCase() || '';
            // Vérifier si c'est vraiment une erreur
            if (text.includes('error') || text.includes('invalid') || 
                text.includes('required') || text.includes('incorrect')) {
              console.log('🚨 Erreur détectée:', text.substring(0, 100));
              return true;
            }
          }
        }
      }
      return false;
    }
  };

  // Utilitaires pour les mots de passe
  window.PasswordUtils = {
    generateSecurePassword(length = 16) {
      const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#.?$%^&*';
      let password = '';
      for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
      }
      return password;
    },
    
    assessPasswordStrength(password) {
      let score = 0;
      if (password.length >= 8) score++;
      if (password.length >= 12) score++;
      if (/[a-z]/.test(password)) score++;
      if (/[A-Z]/.test(password)) score++;
      if (/[0-9]/.test(password)) score++;
      if (/[^A-Za-z0-9]/.test(password)) score++;
      
      const levels = ['Très faible', 'Faible', 'Moyen', 'Fort', 'Très fort'];
      const colors = ['#f44336', '#ff9800', '#ffeb3b', '#8bc34a', '#4caf50'];
      
      return {
        score: Math.min(score, 5),
        level: levels[Math.min(score - 1, 4)] || 'Très faible',
        color: colors[Math.min(score - 1, 4)] || '#f44336'
      };
    }
  };

  // Configuration API
  window.API_CONFIG = {
    BASE_URL: 'https://cornflowerblue-dog-952254.hostingersite.com',
    ENDPOINTS: {
      LOGIN: '/index.php'
    }
  };

  class SecurePassExtension {
    constructor() {
      this.state = window.SecurePassState;
      this.pendingSaves = new Map(); // Pour éviter les sauvegardes multiples
      this.init();
    }

    async init() {
      console.log('🔐 SecurePass Extension initialisée');
      
      // Vérifier si nous sommes dans les paramètres de Chrome
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        // On est dans l'extension, pas dans les paramètres
        console.log('ℹ️ Extension chargée dans le contexte de l\'extension');
      } else {
        // On est probablement dans les paramètres de Chrome
        console.log('ℹ️ Extension chargée depuis les paramètres de Chrome');
        return;
      }
      
      // Écouter les événements de focus sur les champs password
      this.setupPasswordFieldListeners();
      this.setupEmailFieldListeners();
      
      // Écouter les messages de synchronisation
      this.setupMessageListeners();
      
      // Vérifier les identifiants existants
      this.checkPageCredentials();
      
      // Vérification périodique de l'authentification (moins fréquente)
      setInterval(() => this.checkAuthentication(), 60000);
    }    

    checkPageCredentials() {
      const domain = window.location.hostname;
      const path = window.location.pathname;
    
      let isLoginPage = [
        '/login', '/signin', '/sign-in', '/log-in', '/auth', '/authenticate'
      ].some(p => path.toLowerCase().includes(p));
    
      const forms = Array.from(document.querySelectorAll('form'));
    
      // 🔒 Nouvelle vérification : si un formulaire d'inscription est détecté → ne pas continuer
      for (const form of forms) {
        if (this.detectSignupForm(form)) {
          console.log("❌ Formulaire d'inscription détecté – aucun popup d'auto-remplissage affiché");
          return; // On quitte la fonction directement
        }
      }
    
      if (!isLoginPage) {
        // 🧠 Si aucun chemin explicite, vérifier s'il y a un champ password → login probable
        for (const form of forms) {
          const passwordField = form.querySelector('input[type="password"]');
          if (passwordField) {
            isLoginPage = true;
            console.log("✅ Formulaire avec champ password détecté – Login page probable");
            break;
          }
        }
      }
    
      this.getExistingCredentials(domain).then(credentials => {
        if (credentials && credentials.length > 0) {
          const popupState = this.state.getState();
    
          // Réinitialiser l'état de suppression du popup à chaque chargement de page
          this.state.setState({ autoFillDismissed: false });
    
          for (const form of forms) {
            const { emailField, passwordField } = this.detectFormFields(form);
    
            // Afficher le popup uniquement si nous sommes sur une page de connexion
            if ((emailField || passwordField) && !popupState.activePopup && isLoginPage) {
              console.log('📦 Affichage auto du popup de remplissage à l\'ouverture sur une page de connexion');
    
              const targetField = emailField || passwordField;
              this.showAutoFillPopup(targetField, form, credentials[0], () => {
                this.state.setState({ autoFillDismissed: true, activePopup: false });
              });
    
              break; // Un seul popup affiché max
            }
          }
    
          // 🧩 Observer dynamiquement les futurs formulaires ajoutés au DOM
          this.setupFormObservers(credentials[0]);
        } else {
          console.log('📭 Aucun identifiant trouvé pour ce domaine à l\'ouverture');
        }
      });
    }    

    detectFormFields(form) {
      // Détection des champs email/username
      const emailField = form.querySelector(
        'input[type="email"], ' +
        'input[type="text"][name*="email"], ' +
        'input[type="text"][name*="user"], ' +
        'input[type="text"][name*="username"], ' +
        'input[type="text"][name*="login"], ' +
        'input[type="text"][placeholder*="email"], ' +
        'input[type="text"][placeholder*="username"], ' +
        'input[type="text"][placeholder*="login"], ' +
        'input[type="text"][class*="email"], ' +
        'input[type="text"][class*="username"], ' +
        'input[type="text"][class*="login"]'
      );

      // Détection du champ password
      const passwordField = form.querySelector(
        'input[type="password"], ' +
        'input[type="text"][name*="password"], ' +
        'input[type="text"][placeholder*="password"], ' +
        'input[type="text"][class*="password"]'
      );
      
      return { emailField, passwordField };
    }

    setupBeaconSave(form, domain, password) {
      try {
        const emailField = form.querySelector('input[type="email"], input[name*="user"], input[name*="email"]');
        const email = emailField?.value || '';
    
        const data = {
          urlPageWeb: domain,
          usernamePageWeb: email || 'user_' + Date.now(),
          email,
          passwordCompte: password
        };
    
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        navigator.sendBeacon('https://cornflowerblue-dog-952254.hostingersite.com/save_password.php', blob);
        console.log('📤 Sauvegarde envoyée avec sendBeacon');
      } catch (err) {
        console.error('❌ Erreur sendBeacon:', err);
      }
    }

    setupFormObservers(credentials) {
      // Vérifier si nous sommes sur une page de connexion
      const path = window.location.pathname;
      const isLoginPage = [
        '/login', '/signin', '/sign-in', '/log-in', '/auth', '/authenticate'
      ].some(p => path.toLowerCase().includes(p));      
    
      if (!isLoginPage) {
        // 🧠 Vérifie si un formulaire avec champ password est visible → on considère que c’est un login
        const forms = Array.from(document.querySelectorAll('form'));
        for (const form of forms) {
          const passwordField = form.querySelector('input[type="password"]');
          if (passwordField) {
            isLoginPage = true;
            console.log("✅ Formulaire avec champ password détecté – Login page probable");
            break;
          }
        }
      }      
    
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
              const form = node.closest('form');
              if (form) {
                const emailField = form.querySelector(
                  'input[type="email"], ' +
                  'input[type="text"][name*="email"], ' +
                  'input[type="text"][name*="username"], ' +
                  'input[type="text"][placeholder*="email"], ' +
                  'input[type="text"][placeholder*="username"]'
                );
    
                const passwordField = form.querySelector(
                  'input[type="password"], ' +
                  'input[type="text"][name*="password"], ' +
                  'input[type="text"][placeholder*="password"]'
                );
    
                if (emailField || passwordField) {
                  console.log('🔍 Champ(s) de formulaire détecté(s)', { emailField, passwordField });
    
                  if (emailField) {
                    emailField.addEventListener('focus', () => this.showAutoFillPopup(emailField, form, credentials));
                  }
                  if (passwordField) {
                    passwordField.addEventListener('focus', () => this.showAutoFillPopup(passwordField, form, credentials));
                  }
                }
              }
            }
          });
        });
      });
    
      // Observer le corps de la page
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    
      // Vérifier les champs existants dès maintenant
      const forms = Array.from(document.querySelectorAll('form'));
      forms.forEach(form => {
        const emailField = form.querySelector(
          'input[type="email"], ' +
          'input[type="text"][name*="email"], ' +
          'input[type="text"][name*="username"], ' +
          'input[type="text"][placeholder*="email"], ' +
          'input[type="text"][placeholder*="username"]'
        );
    
        const passwordField = form.querySelector(
          'input[type="password"], ' +
          'input[type="text"][name*="password"], ' +
          'input[type="text"][placeholder*="password"]'
        );
    
        if (emailField || passwordField) {
          console.log('🔍 Champ(s) de formulaire détecté(s) au chargement', { emailField, passwordField });
    
          if (emailField) {
            emailField.addEventListener('focus', () => this.showAutoFillPopup(emailField, form, credentials));
          }
          if (passwordField) {
            passwordField.addEventListener('focus', () => this.showAutoFillPopup(passwordField, form, credentials));
          }
        }
      });
    
      // ✅ Nettoyage automatique de l'observateur après 30 secondes
      setTimeout(() => observer.disconnect(), 30000);
    } 

    setupPasswordFieldListeners() {
      document.addEventListener('focusin', async (event) => {
        const target = event.target;
        
        // Vérifier si c'est un champ de mot de passe ou un champ qui pourrait en être un
        if (target.type !== 'password' && 
            !target.name?.toLowerCase().includes('password') &&
            !target.placeholder?.toLowerCase().includes('password')) {
          return;
        }
        
        // Éviter les popups sur les pages de l'extension
        if (window.location.href.includes('cornflowerblue-dog-952254.hostingersite.com')) {
          return;
        }

        try {
          // Vérifier si on peut afficher un popup
          if (!this.state.getState().activePopup) {
            console.log('🎯 Champ de mot de passe détecté, vérification de la suggestion');
            await this.handlePasswordFieldFocus(target);
          }
        } catch (error) {
          console.error('❌ Erreur lors du traitement du champ de mot de passe:', error);
        }
      });
    }   

    setupMessageListeners() {
      window.addEventListener('message', (event) => {
        if (event.data === 'authentication_success') {
          console.log('✅ Authentification réussie reçue');
          this.state.clearDismissed();
          this.checkAuthentication(true);
          window.NotificationSystem.show('Connexion réussie !', 'success');
        }
      });
    }

    async checkAuthentication(force = false) {
      try {
        console.log('🎯 Début de checkAuthentication');
    
        // Éviter les appels multiples en parallèle
        if (authCheckInProgress) {
          console.log('ℹ️ Vérification déjà en cours, retour de l\'état actuel');
          return {
            success: true,
            data: {
              authenticated: this.state.getState().isAuthenticated,
              username: this.state.getState().currentUsername || ''
            }
          };
        }
    
        authCheckInProgress = true;
    
        const now = Date.now();
        const lastCheck = this.state.getState().lastAuthCheck || 0;
        const shouldRefresh = force || (now - lastCheck >= 30000);
    
        if (!shouldRefresh) {
          return {
            success: true,
            data: {
              authenticated: this.state.getState().isAuthenticated,
              username: this.state.getState().currentUsername || ''
            }
          };
        }
    
        // Communication avec le background
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: "check_auth" }, (resp) => {
            if (chrome.runtime.lastError) {
              console.warn('⚠️ Impossible de contacter le background :', chrome.runtime.lastError.message);
              return resolve({ success: false, data: { authenticated: false, username: '' } });
            }
            console.log('✅ Réponse du background:', resp);
            resolve(resp || { success: false, data: { authenticated: false, username: '' } });
          });
        });
    
        const isAuth = response?.success && response.data?.authenticated === true;
        const username = response?.data?.username || '';
    
        // Mise à jour du state global
        this.state.setState({
          isAuthenticated: isAuth,
          currentUsername: username,
          lastAuthCheck: now,
          needsReconnect: false
        });
    
        return {
          success: true,
          data: {
            authenticated: isAuth,
            username
          }
        };
    
      } catch (error) {
        console.error('❌ Erreur dans checkAuthentication:', error);
        this.state.setState({
          isAuthenticated: false,
          currentUsername: '',
          lastAuthCheck: Date.now(),
          needsReconnect: true
        });
    
        return {
          success: false,
          data: {
            authenticated: false,
            username: ''
          }
        };
      } finally {
        authCheckInProgress = false;
      }
    }        

    async handleSaveError(errorMessage, form, domain, password) {
      const state = this.state.getState();
      
      // Gérer les erreurs spécifiques
      if (errorMessage?.includes('403') || errorMessage?.includes('Forbidden') || errorMessage?.includes('Cloudflare')) {
        window.NotificationSystem.show('⚠️ Protection anti-bot détectée - Nouvelle tentative dans 10 secondes', 'warning');
        
        if (state.saveAttempts < state.maxSaveAttempts) {
          // Pour les erreurs Cloudflare, attendre plus longtemps
          await new Promise(resolve => setTimeout(resolve, 10000));
          return this.attemptSave(form, domain, password);
        } else {
          window.NotificationSystem.show('❌ Trop de tentatives Cloudflare - Veuillez réessayer plus tard', 'error');
        }
      } 
      else if (errorMessage?.includes('500') || errorMessage?.includes('Internal Server Error')) {
        window.NotificationSystem.show('⚠️ Erreur serveur - Nouvelle tentative dans 5 secondes', 'warning');
        
        if (state.saveAttempts < state.maxSaveAttempts) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          return this.attemptSave(form, domain, password);
        } else {
          window.NotificationSystem.show('❌ Trop d\'erreurs serveur - Veuillez vérifier votre connexion', 'error');
        }
      }
      else if (errorMessage?.includes('invalidated') || errorMessage?.includes('Extension context')) {
        window.NotificationSystem.show('⚠️ Extension rechargée - Veuillez réessayer', 'warning');
        this.state.setState({ needsReconnect: true });
      }
      else if (errorMessage?.includes('Timeout')) {
        window.NotificationSystem.show('⚠️ Délai dépassé - Vérifiez votre connexion', 'warning');
        
        if (state.saveAttempts < state.maxSaveAttempts) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          return this.attemptSave(form, domain, password);
        }
      }
      else {
        window.NotificationSystem.show('❌ Erreur de sauvegarde - Réessayez plus tard', 'error');
      }
    }
    
    detectLoginForm(form) {
      // Détection des formulaires de connexion
      const loginIndicators = [
        'login', 'signin', 'sign-in', 'auth', 'authenticate',
        'connexion', 'connection', 'connect', 'log-in', 'sign-on'
      ];

      // Vérifier le nom du formulaire
      if (form.name?.toLowerCase().includes('login') ||
          form.name?.toLowerCase().includes('signin') ||
          form.name?.toLowerCase().includes('sign-in')) {
        return true;
      }

      // Vérifier les noms des champs
      const fields = form.querySelectorAll('input, button, select');
      for (const field of fields) {
        const name = field.name?.toLowerCase() || '';
        const id = field.id?.toLowerCase() || '';
        const value = field.value?.toLowerCase() || '';
        const placeholder = field.placeholder?.toLowerCase() || '';

        if (loginIndicators.some(indicator => 
          name.includes(indicator) ||
          id.includes(indicator) ||
          value.includes(indicator) ||
          placeholder.includes(indicator)
        )) {
          return true;
        }
      }

      return false;
    }

    detectSignupForm(form) {
      const formText = [
        form.getAttribute('id') || '',
        form.getAttribute('class') || '',
        form.getAttribute('action') || '',
        form.innerText || ''
      ].join(' ').toLowerCase();
    
      const signupKeywords = ['signup', 'register', 'inscription', 'create account', 'new account', 'sign-up', 'join', 'freepik'];
      const loginKeywords = ['login', 'signin', 'connexion', 'connect'];
    
      const hasSignupKeyword = signupKeywords.some(keyword => formText.includes(keyword));
      const hasLoginKeyword = loginKeywords.some(keyword => formText.includes(keyword));
    
      const emailOrUserFields = form.querySelectorAll('input[type="email"], input[name*="email"], input[name*="user"]');
      const passwordFields = form.querySelectorAll('input[type="password"]');
    
      const hasMultiplePasswordFields = passwordFields.length >= 2;
    
      // Heuristique : s'il y a des mots-clés ou plusieurs champs de mot de passe, ou beaucoup de champs
      return (
        (!hasLoginKeyword && hasSignupKeyword) ||
        hasMultiplePasswordFields ||
        (emailOrUserFields.length >= 1 && passwordFields.length >= 1 && form.querySelectorAll('input').length >= 3)
      );
    }    

    async handlePasswordFieldFocus(passwordField) {
      console.log('🎯 Champ password détecté');
      try {
        const form = passwordField.closest('form');
        if (!form) return;
    
        const domain = window.location.hostname;
    
        // Éviter doublon de popup
        if (this.state.getState().checkingAuth) {
          console.log('⏳ Auth déjà en cours, on attend...');
          return;
        }
        this.state.setState({ checkingAuth: true });
    
        // ⚠️ Toujours vérifier à jour
        console.log('⏳ Vérification d\'authentification en cours...');
        const confirmed = await this.checkAuthentication(true);
        const isActuallyAuthenticated = confirmed === true || confirmed?.data?.authenticated === true;

        if (!isActuallyAuthenticated) {
          const alreadyDismissed = this.state.getState().loginReminderDismissed;
          if (!alreadyDismissed) {
            console.log('📢 Affichage du rappel de connexion');
            this.showLoginReminder();
            this.state.setState({ loginReminderDismissed: true });
          } else {
            console.log('⏹️ Rappel déjà affiché, on n\'insiste pas');
          }
          return;
        }

        // Détection du type de formulaire
        const isLoginForm = this.detectLoginForm(form);
        const isSignupForm = this.detectSignupForm(form);

        if (isSignupForm) {
          console.log('🔍 Formulaire d\'inscription détecté');
          await this.showPasswordSuggestion(passwordField, form, domain);
        } else if (isLoginForm) {
          console.log('🔍 Formulaire de connexion détecté');
          this.checkPageCredentials();
        } else {
          console.log('🔍 Type de formulaire indéterminé');

          const popupActive = this.state.getState().activePopup;
          if (!popupActive) {
            console.log('📌 Suggestion par défaut dans cas incertain');
            await this.showPasswordSuggestion(passwordField, form, domain);
          }
        }
    
      } catch (error) {
        console.error('❌ Erreur dans handlePasswordFieldFocus:', error);
        window.NotificationSystem.show('Erreur lors de la gestion du formulaire', 'error');
      } finally {
        // Nettoyage éventuel du popup
        if (this.state.getState().activePopup) {
          this.state.setState({ activePopup: null });
        }
        this.state.setState({ checkingAuth: false });
      }
    }   

    setupEmailFieldListeners() {
      document.addEventListener('focusin', async (event) => {
        const target = event.target;
    
        if (!target.matches('input[type="email"], input[name*="user"], input[name*="email"], input[placeholder*="email"], input[placeholder*="user"]')) return;
    
        const form = target.closest('form');
        if (!form || this.state.getState().activePopup || this.state.getState().autoFillDismissed) return;
    
        // 🔒 Nouvelle protection : ignorer si c’est une inscription
        if (this.detectSignupForm(form)) {
          console.log('❌ Formulaire d\'inscription détecté sur focus email – pas de popup auto-remplissage');
          return;
        }
    
        const domain = window.location.hostname;
        console.log('📌 Focus sur champ email/username détecté');
    
        const confirmed = await this.checkAuthentication();
        const isAuthenticated = confirmed?.data?.authenticated === true;
    
        if (!isAuthenticated) {
          console.log('🚫 Utilisateur non authentifié, aucun popup');
          return;
        }
    
        // Vérifier si c'est un formulaire de connexion
        if (this.detectLoginForm(form)) {
          const credentials = await this.getExistingCredentials(domain);
          if (credentials.length > 0) {
            console.log('📦 Identifiants trouvés, affichage du popup');
            this.showAutoFillPopup(target, form, credentials[0], () => {
              this.state.setState({ autoFillDismissed: true });
            });
          } else {
            console.log('📭 Aucun identifiant enregistré pour ce domaine');
          }
        }
      });
    }    

    async showPasswordSuggestion(passwordField, form, domain) {
      if (this.state.getState().activePopup) return;

      const popup = new PasswordSuggestionPopup({
        onUse: async (password) => {
          await this.handlePasswordUse(password, passwordField, form, domain);
        },
        onDismiss: () => {
          this.state.dismissPopup();
          this.state.setState({ activePopup: null });
        }
      });

      this.state.setState({ activePopup: popup });
      popup.show();
    }

    async showAutoFillPopup(passwordField, form, credentials, onDismiss = null) {
      console.log('🚀 showAutoFillPopup appelée');
    
      if (this.state.getState().activePopup) return;
    
      const popup = new AutoFillPopup({
        credentials: credentials,
        onFill: async () => {
          const usernameField = form.querySelector('input[type="text"], input[type="email"], input[name*="user"], input[name*="email"]');
          const passwordFields = form.querySelectorAll('input[type="password"]');
          if (passwordFields.length > 0) {
            this.fillCredentials(credentials, usernameField, passwordFields);
          } else {
            console.warn('⚠️ Aucun champ password détecté dans le formulaire');
          }          
        },
        onDismiss: () => {
          this.state.dismissPopup();
          this.state.setState({ activePopup: null });
          if (typeof onDismiss === 'function') onDismiss();
        }
      });
    
      this.state.setState({ activePopup: popup });
      popup.show();
    }        

    fillCredentials(credentials, usernameField, passwordFields) {
      // 🔐 1. Remplir le champ username si présent
      if (usernameField) {
        const usernameValue = credentials.username || credentials.email || '';
        usernameField.focus(); // 🔑 Amélioration : forcer le focus
        usernameField.value = usernameValue;
        window.DOMUtils.triggerInputEvents(usernameField, usernameValue);
        console.log('✅ Champ username rempli');
      } else {
        console.warn('⚠️ Aucun champ username détecté');
      }
    
      // 🔐 2. Remplir le champ password
      if (passwordFields.length > 0) {
        const passwordField = passwordFields[0];
        const passwordValue = credentials.password || '';
    
        passwordField.focus(); // 🔑 focus pour forcer Chrome à autoriser le remplissage
        passwordField.value = passwordValue;
        window.DOMUtils.triggerInputEvents(passwordField, passwordValue);
        console.log('✅ Champ password rempli');
      } else {
        console.warn('⚠️ Aucun champ password détecté');
        window.NotificationSystem.show("Aucun champ de mot de passe détecté", 'error');
        return;
      }
    
      // 🎉 Notification finale
      window.NotificationSystem.show('Identifiants remplis automatiquement', 'success');
    }    

    async getExistingCredentials(domain) {
      try {
        // Vérifier si l'extension est active
        if (!chrome.runtime?.id) {
          console.warn('❌ Extension inactive');
          return [];
        }

        const response = await new Promise((resolve) => {
          console.log("📤 Envoi à background :", { action: "getCredentials", domain });
          chrome.runtime.sendMessage({ action: "getCredentials", domain }, resolve);
        });
    
        if (response && response.success) {
          console.log("✅ Identifiants reçus :", response.credentials);
          return response.credentials ? [response.credentials] : [];
        } else {
          console.log('📭 Aucun identifiant trouvé pour', domain);
          return [];
        }
      } catch (error) {
        console.error('❌ Erreur lors de la récupération des identifiants:', error);
        return [];
      }
    }    

    showLoginReminder() {
      if (this.state.getState().activePopup || this.state.getState().dismissedPopup) {
        return;
      }

      const popup = new LoginReminderPopup({
        onLogin: () => {
          window.open(`${window.API_CONFIG.BASE_URL}${window.API_CONFIG.ENDPOINTS.LOGIN}`, '_blank');
        },
        onDismiss: () => {
          this.state.dismissPopup();
          this.state.setState({ activePopup: null, dismissedPopup: true });
        }
      });

      this.state.setState({ activePopup: popup });
      popup.show();
    }

    async handlePasswordUse(password, passwordField, form, domain) {
      try {
        console.log('🎯 Début de handlePasswordUse pour le domaine:', domain);
    
        this.state.resetSaveAttempts();
    
        passwordField.value = password;
        window.DOMUtils.triggerInputEvents(passwordField, password);
        console.log('✅ Champ password rempli');
    
        const emailField = form.querySelector('input[type="email"], input[name*="user"], input[name*="email"]');
        const email = emailField?.value || '';

        // Appel au background
        chrome.runtime.sendMessage({
          action: "backgroundSave",
          data: {
            urlPageWeb: domain,
            usernamePageWeb: email || 'user_' + Date.now(),
            email,
            passwordCompte: password
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("❌ Erreur envoi backgroundSave :", chrome.runtime.lastError.message);
          } else if (response && response.success) {
            console.log("✅ Sauvegarde réussie via background");
          } else {
            console.error("❌ Échec de la sauvegarde via background");
          }
        });
    
        // 🎯 Cibler le bouton de soumission
        const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
        if (submitButton) {
          // Retirer les anciens écouteurs si nécessaire
          submitButton.addEventListener('click', async (event) => {
            if (this.state.getState().saveInProgress) return;
    
            console.log('🖱️ Clic sur le bouton de soumission détecté');
    
            this.state.setState({ saveInProgress: true });
    
            try {
              await this.attemptSave(form, domain, password);
              console.log('✅ Tentative de sauvegarde terminée');
            } catch (err) {
              console.error('❌ Échec de la sauvegarde :', err);
            } finally {
              this.state.setState({ saveInProgress: false });
            }
          }, { once: true });
    
          console.log('✅ Écouteur de clic bouton submit ajouté');
        } else {
          console.warn('⚠️ Aucun bouton submit détecté dans le formulaire');
        }
    
        // En plus, observer si un changement de page a lieu
        this.setupPageChangeListener(form, domain, password);
    
      } catch (error) {
        console.error('❌ Erreur dans handlePasswordUse:', error);
        window.NotificationSystem.show('Erreur lors de la gestion du mot de passe', 'error');
      }
    }       

    async attemptReconnect() {
      try {
        console.log('🔄 Tentative de reconnexion...');
        // Réinitialiser l'état
        this.state.setState({
          isAuthenticated: false,
          currentUsername: '',
          lastAuthCheck: 0,
          needsReconnect: false
        });
        
        // Forcer une nouvelle vérification d'authentification
        await this.checkAuthentication(true);
        
        const state = this.state.getState();
        if (state.isAuthenticated) {
          console.log('✅ Reconnexion réussie');
          return true;
        } else {
          console.warn('⚠️ Reconnexion échouée');
          return false;
        }
      } catch (error) {
        console.error('❌ Erreur lors de la reconnexion:', error);
        window.NotificationSystem.show('⚠️ Impossible de se reconnecter. Veuillez recharger l\'extension.', 'error');
        return false;
      }
    }

    getOptimalWaitTime(domain) {
      // Délais optimisés selon les types de sites
      const sitePatterns = {
        'opencart': 4000,      // OpenCart nécessite plus de temps
        'woocommerce': 3000,   // WooCommerce
        'shopify': 2000,       // Shopify
        'magento': 4000,       // Magento
        'wordpress': 3000,     // WordPress
        'default': 2000        // Défaut
      };
    
      for (const [pattern, delay] of Object.entries(sitePatterns)) {
        if (domain.includes(pattern)) {
          return delay;
        }
      }
      
      return sitePatterns.default;
    }
    
    setupPageChangeListener(form, domain, password) {
      // Créer un identifiant unique pour cette tentative de sauvegarde
      const saveId = `${domain}-${Date.now()}`;
      
      // Ajouter un délai avant de détecter le changement de page
      setTimeout(() => {
        const isPageChanged = window.DOMUtils.detectPageChange();
        
        // Vérifier si cette sauvegarde est toujours pertinente
        if (this.pendingSaves.has(saveId)) {
          if (isPageChanged) {
            // La page a changé, marquer comme échoué mais ne pas annuler
            this.pendingSaves.set(saveId, { status: 'failed', reason: 'page_change' });
          } else {
            // Procéder à la sauvegarde
            this.attemptSave(form, domain, password);
          }
        }
      }, 1000); // Attendre 1 seconde pour détecter le changement de page
    }
    
    async attemptSave(form, domain, password) {
      try {
        // Éviter les sauvegardes multiples pour le même formulaire
        const formId = form.id || form.action || domain;
        if (this.pendingSaves && this.pendingSaves.has(formId)) {
          console.log('⚠️ Sauvegarde déjà en cours pour ce formulaire');
          return;
        }
        
        if (this.pendingSaves) {
          this.pendingSaves.set(formId, true);
        }
    
        // Vérifier si l'extension est toujours active
        if (!chrome.runtime?.id) {
          console.warn('⚠️ Extension inactive');
          throw new Error('Extension context invalid');
        }
    
        // Vérifier l'état d'authentification
        const state = this.state.getState();
        if (state.needsReconnect) {
          console.log('🔄 Tentative de reconnexion avant la sauvegarde...');
          await this.attemptReconnect();
        }
    
        // Vérifier le nombre de tentatives
        if (!this.state.canAttemptSave()) {
          console.warn('⚠️ Nombre maximum de tentatives de sauvegarde atteint');
          window.NotificationSystem.show('Échec de sauvegarde après plusieurs tentatives', 'warning');
          return;
        }
    
        this.state.incrementSaveAttempts();
    
        // Attendre un délai plus long pour les protections anti-bot
        console.log('⏳ Attente pour éviter les protections anti-bot...');
        await new Promise(resolve => setTimeout(resolve, 3000));
    
        // Détecter si la soumission a réussi
        const hasErrors = window.DOMUtils.detectFormErrors();
        const pageChanged = await window.DOMUtils.detectPageChange();
    
        if (hasErrors) {
          console.log('❌ Erreurs détectées dans le formulaire, abandon de la sauvegarde');
          window.NotificationSystem.show('Erreurs dans le formulaire - Sauvegarde annulée', 'warning');
          return;
        }
    
        if (!pageChanged) {
          console.log('⚠️ Aucun changement de page détecté, possible échec de soumission');
          // Ne pas abandonner complètement, mais avertir l'utilisateur
          window.NotificationSystem.show('Soumission incertaine - Tentative de sauvegarde quand même', 'warning');
        }
    
        // Récupérer les valeurs du formulaire
        const usernameField = form.querySelector('input[type="text"], input[type="email"], input[name*="user"], input[name*="email"]');
        const emailField = form.querySelector('input[type="email"]');
        
        const usernameValue = usernameField?.value || '';
        const emailValue = emailField?.value || '';
    
        // Préparer les données pour la sauvegarde
        const saveData = {
          urlPageWeb: domain || 'localtest.local',
          usernamePageWeb: usernameValue || emailValue || 'user_' + Date.now(),
          email: emailValue,
          passwordCompte: password
        };
    
        console.log('📝 Tentative de sauvegarde:', {
          urlPageWeb: saveData.urlPageWeb,
          usernamePageWeb: saveData.usernamePageWeb,
          email: saveData.email,
          hasPassword: !!saveData.passwordCompte,
          attempt: this.state.getState().saveAttempts
        });
    
        // Utiliser le background script pour sauvegarder
        const response = await new Promise((resolve, reject) => {
          if (!chrome.runtime?.id) {
            console.warn('⚠️ Extension inactive');
            reject(new Error('Extension inactive'));
            return;
          }

          chrome.runtime.sendMessage({
            action: "savePassword",
            data: saveData
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });

        if (response && response.success) {
          console.log('✅ Sauvegarde réussie');
          window.NotificationSystem.show('Identifiants sauvegardés avec succès !', 'success');
          this.state.resetSaveAttempts();
        } else {
          const errorMsg = typeof response?.error === 'string' ? response.error : JSON.stringify(response?.error);
          console.error('❌ Erreur de sauvegarde:', errorMsg || 'Erreur inconnue');
          await this.handleSaveError(errorMsg || 'Erreur inconnue', form, domain, password);
        }
    
      } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde:', error);
        await this.handleSaveError(error.message, form, domain, password);
      } finally {
        // Nettoyer le flag de sauvegarde en cours
        if (this.pendingSaves) {
          const formId = form.id || form.action || domain;
          this.pendingSaves.delete(formId);
        }
      }
    }
  }

  // Classes pour les popups
  class BasePopup {
    constructor(options = {}) {
      this.options = options;
      this.element = null;
    }

    show() {
      this.element = this.createElement();
      document.body.appendChild(this.element);
      this.animateIn();
    }

    hide() {
      if (this.element) {
        this.animateOut(() => {
          if (this.element.parentNode) {
            document.body.removeChild(this.element);
          }
          this.element = null;
        });
      }
    }

    animateIn() {
      const content = this.element.querySelector('.securepass-popup-content');
      if (content) {
        requestAnimationFrame(() => {
          content.classList.add('securepass-popup-show');
        });
      }
    }

    animateOut(callback) {
      const content = this.element.querySelector('.securepass-popup-content');
      if (content) {
        content.classList.add('securepass-popup-hide');
        setTimeout(callback, 200);
      } else if (callback) {
        callback();
      }
    }

    createOverlay() {
      return `
        <div class="securepass-popup-overlay">
          <div class="securepass-popup-content">
            ${this.getContent()}
          </div>
        </div>
      `;
    }

    createElement() {
      const div = document.createElement('div');
      div.className = 'securepass-popup';
      div.innerHTML = this.createOverlay();
      
      // Gestion des événements
      this.setupEventListeners(div);
      
      return div;
    }

    setupEventListeners(element) {
      // Fermeture sur clic overlay
      const overlay = element.querySelector('.securepass-popup-overlay');
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay && this.options.onDismiss) {
          this.options.onDismiss();
          this.hide();
        }
      });

      // Bouton fermer
      const closeBtn = element.querySelector('.securepass-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          if (this.options.onDismiss) this.options.onDismiss();
          this.hide();
        });
      }
    }

    getContent() {
      return '<div>Popup de base</div>';
    }
  }

  class LoginReminderPopup extends BasePopup {
    getContent() {
      return `
        <div class="securepass-popup-header">
          <div class="securepass-popup-icon">
            <svg width="28" height="28" fill="white" viewBox="0 0 24 24">
              <path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,7C13.4,7 14.8,8.6 14.8,10V11.4C15.4,11.4 16,12 16,12.6V16.6C16,17.2 15.4,17.8 14.8,17.8H9.2C8.6,17.8 8,17.2 8,16.6V12.6C8,12 8.6,11.4 9.2,11.4V10C9.2,8.6 10.6,7 12,7M12,8.2C11.2,8.2 10.4,8.7 10.4,10V11.4H13.6V10C13.6,8.7 12.8,8.2 12,8.2Z"/>
            </svg>
          </div>
          <h3>SecurePass</h3>
          <p>Connexion requise</p>
        </div>
        
        <div class="securepass-popup-message">
          <p>Connectez-vous pour gérer vos mots de passe automatiquement</p>
        </div>
        <div class="securepass-popup-actions">
          <button class="securepass-btn securepass-btn-primary" id="securepass-login-btn">
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10,17V14H3V10H10V7L15,12L10,17M10,2H19A2,2 0 0,1 21,4V20A2,2 0 0,1 19,22H10A2,2 0 0,1 8,20V18H10V20H19V4H10V6H8V4A2,2 0 0,1 10,2Z"/>
            </svg>
            Se connecter
          </button>
          
          <button class="securepass-btn securepass-btn-secondary securepass-close-btn">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
            </svg>
            Ignorer
          </button>
        </div>
        
        <div class="securepass-popup-footer">
          <p>Sécurisé • Chiffré • Local</p>
        </div>
      `;
    }

    setupEventListeners(element) {
      super.setupEventListeners(element);

      const loginBtn = element.querySelector('#securepass-login-btn');
      loginBtn.addEventListener('click', () => {
        if (this.options.onLogin) this.options.onLogin();
        this.hide();
      });
    }
  }

  class PasswordSuggestionPopup extends BasePopup {
    constructor(options) {
      super(options);
      this.password = window.PasswordUtils.generateSecurePassword(16);
    }

    getContent() {
      const strength = window.PasswordUtils.assessPasswordStrength(this.password);
      
      return `
        <div class="securepass-popup-header">
          <div class="securepass-popup-icon">
            <svg width="24" height="24" fill="white" viewBox="0 0 24 24">
              <path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z"/>
            </svg>
          </div>
          <h3>Mot de passe sécurisé</h3>
        </div>
        
        <div class="securepass-password-display">
          <div class="securepass-password-text" id="securepass-password-text">${this.password}</div>
          <div class="securepass-password-strength">
            <div class="securepass-strength-bar">
              <div class="securepass-strength-fill" style="width: ${(strength.score / 5) * 100}%; background-color: ${strength.color}"></div>
            </div>
            <span class="securepass-strength-label" style="color: ${strength.color}">${strength.level.toUpperCase()}</span>
          </div>
        </div>
        
        <div class="securepass-popup-actions">
          <button class="securepass-btn securepass-btn-secondary" id="securepass-copy-btn">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/>
            </svg>
            Copier
          </button>
          
          <button class="securepass-btn securepass-btn-primary" id="securepass-use-btn">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/>
            </svg>
            Utiliser
          </button>
          
          <button class="securepass-btn securepass-btn-danger securepass-close-btn">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
            </svg>
            Fermer
          </button>
        </div>
      `;
    }

    setupEventListeners(element) {
      super.setupEventListeners(element);
    
      const copyBtn = element.querySelector('#securepass-copy-btn');
      const useBtn = element.querySelector('#securepass-use-btn');
    
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(this.password);
          copyBtn.innerHTML = `
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/>
            </svg>
            Copié !
          `;
          copyBtn.classList.add('securepass-btn-success');
          
          window.NotificationSystem.show('Mot de passe copié dans le presse-papier !', 'success');
          
          setTimeout(() => {
            copyBtn.innerHTML = `
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/>
              </svg>
              Copier
            `;
            copyBtn.classList.remove('securepass-btn-success');
          }, 2000);
        } catch (error) {
          console.error('Erreur lors de la copie:', error);
          window.NotificationSystem.show('Erreur lors de la copie', 'error');
        }
      });
    
      useBtn.addEventListener('click', () => {
        if (this.options.onUse) {
          this.options.onUse(this.password);
        }
        this.hide();
      });
    }
  }

  class AutoFillPopup extends BasePopup {
    getContent() {
      const { credentials } = this.options;
      
      return `
        <div class="securepass-popup-header">
          <div class="securepass-popup-icon">
            <svg width="24" height="24" fill="white" viewBox="0 0 24 24">
              <path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z"/>
            </svg>
          </div>
          <h3>Identifiants de Connexion</h3>
          <p>Pour ${credentials.compte || window.location.hostname}</p>
        </div>
        
        <div class="securepass-credentials-info">
          <div class="securepass-credential-item">
            <strong>Utilisateur :</strong> ${credentials.email || credentials.username}
          </div>
        </div>
        
        <div class="securepass-popup-actions">
          <button class="securepass-btn securepass-btn-primary" id="securepass-autofill-btn">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/>
            </svg>
            Remplir
          </button>
          
          <button class="securepass-btn securepass-btn-secondary securepass-close-btn">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
            </svg>
            Fermer
          </button>
        </div>
      `;
    }

    setupEventListeners(element) {
      super.setupEventListeners(element);

      const autofillBtn = element.querySelector('#securepass-autofill-btn');
      autofillBtn.addEventListener('click', () => {
        if (this.options.onFill) {
          this.options.onFill(this.options.credentials);
        }
        this.hide();
      });
    }
  }

  // Initialisation de l'extension
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new SecurePassExtension();

// 🔐 Envoi des cookies au background
chrome.runtime.sendMessage({
  action: "setAuthFromCookie",
  authCookie: document.cookie
});

    });
  } else {
    new SecurePassExtension();

// 🔐 Envoi des cookies au background
chrome.runtime.sendMessage({
  action: "setAuthFromCookie",
  authCookie: document.cookie
});

  }

})();