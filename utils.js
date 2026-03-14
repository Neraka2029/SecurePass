// Utilitaires pour l'extension SecurePass
(function() {
  'use strict';

  // État global de l'extension
  window.SecurePassState = {
    state: {
      isAuthenticated: false,
      currentUsername: '',
      lastAuthCheck: 0,
      activePopup: null,
      dismissedPopup: false,
      lastDismissTime: 0,
      needsReconnect: false
    },
    
    getState() {
      return this.state;
    },
    
    setState(newState) {
      this.state = { ...this.state, ...newState };
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
    }
  };

  // Utilitaires pour les mots de passe
  window.PasswordUtils = {
    generateSecurePassword(length = 16) {
      const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
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

  // Système de notification global
  window.NotificationSystem = {
    show(message, type = 'info') {
      const notification = document.createElement('div');
      notification.className = `securepass-notification ${type}`;
      notification.textContent = message;
      
      // Ajouter un style CSS pour les notifications
      const style = document.createElement('style');
      style.textContent = `
          .securepass-notification {
              position: fixed;
              bottom: 20px;
              right: 20px;
              padding: 15px 25px;
              border-radius: 5px;
              color: white;
              font-family: Arial, sans-serif;
              z-index: 9999;
              animation: slideIn 0.3s ease-out;
          }
          
          .securepass-notification.info {
              background-color: #2196F3;
          }
          
          .securepass-notification.warning {
              background-color: #FFC107;
          }
          
          .securepass-notification.error {
              background-color: #F44336;
          }
          
          .securepass-notification.success {
              background-color: #4CAF50;
          }
          
          @keyframes slideIn {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
          }
      `;
      
      document.head.appendChild(style);
      document.body.appendChild(notification);
      
      // Supprimer la notification après 5 secondes
      setTimeout(() => {
        notification.remove();
      }, 5000);
    }
  };

})();