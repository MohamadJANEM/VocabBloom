// Globale Variablen
const app = {
    vocabData: [],
    chapters: {},
    originalChapters: {},
    currentChapter: [],
    currentIndex: 0,
    showingTranslation: false,
    searchMode: false,
    searchResults: [],
    knownWords: JSON.parse(localStorage.getItem('knownWords')) || [],
    speech: {
      synthesis: window.speechSynthesis,
      voices: [],
      selectedVoice: null
    },
    settings: {
      chapterSize: 50
    }
  };
  
  // Initialisierung
  function initApp() {
    initSpeech();
    loadCSVFile();
    setupEventListeners();
    knownWordsManager.updateUI();
    
    // UI Initialzustand
    document.getElementById('knownWordsList').style.display = 'none';
    document.getElementById('knownWordsToggleIcon').classList.add('fa-chevron-up');
  }
  
  // ==================== MODAL DIALOGE ==================== //
  const modalManager = {
    show: function(message, onConfirm, onDeny = null) {
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      
      modal.innerHTML = `
        <div class="modal-content">
          <p class="modal-message">${message}</p>
          <div class="modal-buttons">
            <button class="modal-button modal-confirm">Ja</button>
            <button class="modal-button modal-deny">Nein</button>
          </div>
        </div>
      `;
      
      // Bestätigungs-Button
      modal.querySelector('.modal-confirm').addEventListener('click', () => {
        document.body.removeChild(modal);
        if (onConfirm) onConfirm();
      });
      
      // Ablehnungs-Button
      modal.querySelector('.modal-deny').addEventListener('click', () => {
        document.body.removeChild(modal);
        if (onDeny) onDeny();
      });
      
      document.body.appendChild(modal);
    }
  };
  
  // ==================== GEWUSSTE WÖRTER ==================== //
  const knownWordsManager = {
    addCurrent: function() {
      const word = this.getCurrentWord();
      if (!word || app.knownWords.includes(word)) return;
  
      app.knownWords.push(word);
      this.save();
      
      if (app.searchMode) {
        app.searchResults.splice(app.currentIndex, 1);
        if (app.currentIndex >= app.searchResults.length && app.searchResults.length > 0) {
          app.currentIndex = Math.max(0, app.searchResults.length - 1);
        }
      } else {
        app.currentChapter.splice(app.currentIndex, 1);
        if (app.currentIndex >= app.currentChapter.length && app.currentChapter.length > 0) {
          app.currentIndex = Math.max(0, app.currentChapter.length - 1);
        }
      }
      
      chapterManager.refresh();
      updateFlashcard();
      
      // Erfolgsmeldung
      this.showMessage(`"${word}" als gewusst markiert`);
    },
  
    remove: function(word) {
      modalManager.show(
        `"${word}" wirklich wieder lernen?`,
        () => {
          app.knownWords = app.knownWords.filter(w => w !== word);
          this.save();
          chapterManager.refresh();
          this.showMessage(`"${word}" wurde wieder zum Lernen hinzugefügt`);
        },
        () => this.showMessage("Aktion abgebrochen")
      );
    },
  
    removeAll: function() {
      modalManager.show(
        "Wirklich ALLE gewussten Wörter löschen?",
        () => {
          app.knownWords = [];
          this.save();
          chapterManager.refresh();
          this.showMessage("Alle gewussten Wörter wurden gelöscht");
        },
        () => this.showMessage("Aktion abgebrochen")
      );
    },
  
    export: function() {
      try {
        const blob = new Blob([app.knownWords.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'gewusste-woerter.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showMessage("Export erfolgreich gestartet");
      } catch (error) {
        this.showMessage("Fehler beim Export: " + error.message);
      }
    },
  
    save: function() {
      localStorage.setItem('knownWords', JSON.stringify(app.knownWords));
      this.updateUI();
    },
  
    updateUI: function() {
      const listElement = document.getElementById('knownWordsList');
      const countElement = document.getElementById('knownWordsCount');
      const searchTerm = document.getElementById('knownWordsSearchInput').value.toLowerCase();
      
      const filteredWords = app.knownWords.filter(word => 
        word.toLowerCase().includes(searchTerm)
      );
      
      listElement.innerHTML = filteredWords.length > 0 
        ? filteredWords.map(word => `
            <li class="known-word-item">
              <span>${word}</span>
              <button class="remove-known-word" title="Wort wieder lernen">
                <i class="fas fa-times"></i>
              </button>
            </li>
          `).join('')
        : '<li class="no-results">Keine Ergebnisse</li>';
      
      // Event-Listener für Löschen-Buttons hinzufügen
      document.querySelectorAll('.remove-known-word').forEach(button => {
        const word = button.parentElement.querySelector('span').textContent;
        button.addEventListener('click', () => this.remove(word));
      });
      
      countElement.textContent = app.knownWords.length;
    },
  
    toggleList: function() {
      const list = document.getElementById('knownWordsList');
      const icon = document.getElementById('knownWordsToggleIcon');
      
      if (list.style.display === 'none') {
        list.style.display = 'block';
        icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
      } else {
        list.style.display = 'none';
        icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
      }
    },
  
    getCurrentWord: function() {
      if (app.searchMode && app.searchResults.length > 0) {
        return app.searchResults[app.currentIndex].english;
      } else if (app.currentChapter.length > 0) {
        return app.currentChapter[app.currentIndex].english;
      }
      return null;
    },
  
    showMessage: function(message) {
      const statusElement = document.getElementById('statusMessage');
      statusElement.textContent = message;
      setTimeout(() => {
        if (statusElement.textContent === message) {
          statusElement.textContent = '';
        }
      }, 3000);
    }
  };
  
  // ==================== KAPITELVERWALTUNG ==================== //
  const chapterManager = {
    create: function() {
      app.chapters = {};
      app.originalChapters = {};
      const total = Math.ceil(app.vocabData.length / app.settings.chapterSize);
      
      for (let i = 0; i < total; i++) {
        const start = i * app.settings.chapterSize;
        const end = start + app.settings.chapterSize;
        app.originalChapters[i + 1] = app.vocabData.slice(start, end);
        app.chapters[i + 1] = app.originalChapters[i + 1].filter(word => 
          !app.knownWords.includes(word.english)
        );
      }
    },
  
    load: function(chapterNum = 1) {
      if (!app.chapters[chapterNum]) return;
      
      app.currentChapter = app.chapters[chapterNum];
      app.currentIndex = 0;
      app.showingTranslation = false;
      app.searchMode = false;
      document.getElementById('flashcard').classList.remove('flipped');
      updateFlashcard();
      this.updateCompletionUI(chapterNum);
    },
  
    buildSelect: function() {
      const select = document.getElementById('chapter');
      select.innerHTML = '<option value="" disabled selected>Bitte auswählen...</option>';
      
      const sortedChapters = Object.keys(app.chapters).sort((a, b) => 
        this.getCompletionPercent(a) - this.getCompletionPercent(b));
      
      sortedChapters.forEach(num => {
        const option = document.createElement('option');
        option.value = num;
        const remaining = app.chapters[num].length;
        const total = app.originalChapters[num].length;
        const percent = this.getCompletionPercent(num);
        
        option.text = `Kapitel ${num} (${remaining}/${total})`;
        option.dataset.completion = percent;
        
        if (remaining === 0) {
          option.classList.add('chapter-completed');
        }
        
        select.appendChild(option);
      });
    },
  
    getCompletionPercent: function(chapterNum) {
      const total = app.originalChapters[chapterNum].length;
      const remaining = app.chapters[chapterNum].length;
      return Math.round(((total - remaining) / total) * 100);
    },
  
    updateCompletionUI: function(chapterNum) {
      const percent = this.getCompletionPercent(chapterNum);
      const completionElement = document.getElementById('chapterCompletion');
      
      if (chapterNum) {
        completionElement.style.display = 'flex';
        document.getElementById('completionText').textContent = `${percent}%`;
        document.getElementById('completionFill').style.width = `${percent}%`;
      } else {
        completionElement.style.display = 'none';
      }
    },
  
    refresh: function() {
      this.create();
      this.buildSelect();
      
      const currentNum = document.getElementById('chapter').value;
      if (!app.searchMode && currentNum) {
        this.load(parseInt(currentNum));
      }
    }
  };
  
  // ==================== KARTENFUNKTIONEN ==================== //
  function updateFlashcard() {
    const flashcard = document.getElementById('flashcard');
    const wordElement = document.getElementById('word');
    const translationElement = document.getElementById('translation');
  
    const currentWord = getCurrentWordObject();
  
    if (currentWord) {
      wordElement.textContent = currentWord.english;
      
      if (app.showingTranslation) {
        translationElement.innerHTML = `
          <div><strong>${currentWord.german}</strong></div>
          <div style="margin-top: 5px;">${currentWord.arabic}</div>
        `;
        flashcard.classList.add('flipped');
      } else {
        translationElement.textContent = '???';
        flashcard.classList.remove('flipped');
      }
      flashcard.style.display = 'block';
    } else {
      wordElement.textContent = app.searchMode ? "Keine Suchergebnisse" : "Keine Vokabeln verfügbar";
      translationElement.textContent = "";
      flashcard.style.display = 'none';
    }
    
    updateProgress();
  }
  
  function getCurrentWordObject() {
    if (app.searchMode && app.searchResults.length > 0) {
      return app.searchResults[app.currentIndex];
    } else if (!app.searchMode && app.currentChapter.length > 0) {
      return app.currentChapter[app.currentIndex];
    }
    return null;
  }
  
  function toggleTranslation() {
    app.showingTranslation = !app.showingTranslation;
    updateFlashcard();
  }
  
  function nextCard() {
    const maxIndex = app.searchMode 
      ? app.searchResults.length - 1 
      : app.currentChapter.length - 1;
    
    if (app.currentIndex < maxIndex) {
      app.currentIndex++;
      app.showingTranslation = false;
      updateFlashcard();
    } else {
      modalManager.show(`Ende der ${app.searchMode ? 'Suchergebnisse' : 'Kapitels'} erreicht!`, null);
    }
  }
  
  function previousCard() {
    if (app.currentIndex > 0) {
      app.currentIndex--;
      app.showingTranslation = false;
      updateFlashcard();
    } else {
      modalManager.show("Dies ist die erste Vokabel!", null);
    }
  }
  
  function updateProgress() {
    const total = app.searchMode 
      ? app.searchResults.length 
      : app.currentChapter.length;
    
    const progress = total > 0 
      ? Math.round(((app.currentIndex + 1) / total) * 100) 
      : 0;
    
    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('progress-text').textContent = `${progress}%`;
  }
  
  // ==================== SPRACHAUSGABE ==================== //
  function initSpeech() {
    app.speech.synthesis.onvoiceschanged = () => {
      app.speech.voices = app.speech.synthesis.getVoices();
      app.speech.selectedVoice = app.speech.voices.find(voice => 
        voice.lang.includes('en') && voice.name.includes('Female')
      ) || app.speech.voices.find(voice => voice.lang.includes('en'));
    };
    
    app.speech.voices = app.speech.synthesis.getVoices();
    if (app.speech.voices.length > 0) {
      app.speech.selectedVoice = app.speech.voices.find(voice => 
        voice.lang.includes('en') && voice.name.includes('Female')
      ) || app.speech.voices.find(voice => voice.lang.includes('en'));
    }
  }
  
  function speakWord(text, lang = 'en-US') {
    if (!app.speech.synthesis) return;
    
    app.speech.synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.pitch = 1;
    
    if (app.speech.selectedVoice) {
      utterance.voice = app.speech.selectedVoice;
    }
    
    app.speech.synthesis.speak(utterance);
  }
  
  function speakCurrentWord() {
    const word = getCurrentWordObject();
    if (word) speakWord(word.english);
  }
  
  // ==================== DATENVERWALTUNG ==================== //
  function loadCSVFile() {
    fetch('oxford.csv')
      .then(response => {
        if (!response.ok) throw new Error('CSV-Datei nicht gefunden');
        return response.text();
      })
      .then(data => {
        Papa.parse(data, {
          complete: function(results) {
            app.vocabData = results.data
              .filter(row => row.length >= 3 && row[0] && row[1] && row[2])
              .map(row => ({
                english: row[0].trim(),
                german: row[1].trim(),
                arabic: row[2].trim()
              }));
    
            if (app.vocabData.length > 0) {
              knownWordsManager.showMessage(`${app.vocabData.length} Vokabeln geladen!`);
              chapterManager.create();
              chapterManager.buildSelect();
              chapterManager.load(1);
            } else {
              knownWordsManager.showMessage("Keine gültigen Vokabeln gefunden");
            }
          },
          error: function(error) {
            knownWordsManager.showMessage("Fehler beim Lesen der CSV: " + error.message);
          },
          delimiter: " ",
          skipEmptyLines: true
        });
      })
      .catch(error => {
        knownWordsManager.showMessage("Fehler: " + error.message);
        console.error('Fehler:', error);
      });
  }
  
  function searchWords() {
    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    
    if (!searchTerm) {
      const currentChapterNum = document.getElementById('chapter').value;
      if (currentChapterNum) chapterManager.load(parseInt(currentChapterNum));
      return;
    }
  
    app.searchResults = app.vocabData
      .filter(word => (
        (word.english && word.english.toLowerCase().includes(searchTerm)) ||
        (word.german && word.german.toLowerCase().includes(searchTerm)) ||
        (word.arabic && word.arabic.toLowerCase().includes(searchTerm))
      )
      .filter(word => !app.knownWords.some(known => 
        known.toLowerCase() === word.english.toLowerCase())
      ));
  
    if (app.searchResults.length > 0) {
      app.searchMode = true;
      app.currentIndex = 0;
      app.showingTranslation = false;
      document.getElementById('flashcard').classList.remove('flipped');
      updateFlashcard();
      knownWordsManager.showMessage(`${app.searchResults.length} Ergebnisse`);
    } else {
      knownWordsManager.showMessage("Keine Treffer");
      document.getElementById('flashcard').style.display = 'none';
    }
  }
  
  // ==================== EVENT LISTENER ==================== //
  function setupEventListeners() {
    document.getElementById('searchButton').addEventListener('click', searchWords);
    document.getElementById('searchInput').addEventListener('keyup', (e) => {
      if (e.key === 'Enter') searchWords();
    });
    
    document.getElementById('knownWordsSearchInput').addEventListener('input', () => {
      knownWordsManager.updateUI();
    });
    
    document.getElementById('chapter').addEventListener('change', (e) => {
      if (e.target.value) chapterManager.load(parseInt(e.target.value));
    });
    
    document.getElementById('flashcard').addEventListener('click', toggleTranslation);
    document.getElementById('nextBtn').addEventListener('click', nextCard);
    document.getElementById('backBtn').addEventListener('click', previousCard);
    document.getElementById('knowBtn').addEventListener('click', () => knownWordsManager.addCurrent());
    document.getElementById('speakBtn').addEventListener('click', speakCurrentWord);
    document.querySelector('.toggle-known-words').addEventListener('click', () => knownWordsManager.toggleList());
document.getElementById('removeAllKnownWordsBtn').addEventListener('click', () => knownWordsManager.removeAll());
document.getElementById('exportKnownWordsBtn').addEventListener('click', () => knownWordsManager.export());
  }
  
  // App starten
  document.addEventListener('DOMContentLoaded', initApp);

