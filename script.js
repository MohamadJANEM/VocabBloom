let vocabData = [];
let chapters = {};
let originalChapters = {};
let chapterSize = 50;
let currentChapter = [];
let currentIndex = 0;
let showingTranslation = false;
let speechSynthesis = window.speechSynthesis;
let voices = [];
let selectedVoice = null;
let knownWords = JSON.parse(localStorage.getItem('knownWords')) || [];
let searchMode = false;
let searchResults = [];

// Modal Dialog Funktionen
function showModal(message, onConfirm, onDeny = null) {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    const messageElement = document.createElement('p');
    messageElement.className = 'modal-message';
    messageElement.textContent = message;
    
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-buttons';
    
    const confirmButton = document.createElement('button');
    confirmButton.className = 'modal-button modal-confirm';
    confirmButton.textContent = 'Ja';
    
    confirmButton.addEventListener('click', () => {
        document.body.removeChild(modal);
        if (onConfirm) onConfirm();
    });
    
    buttonContainer.appendChild(confirmButton);
    
    if (onDeny) {
        const denyButton = document.createElement('button');
        denyButton.className = 'modal-button modal-deny';
        denyButton.textContent = 'Nein';
        
        denyButton.addEventListener('click', () => {
            document.body.removeChild(modal);
            if (onDeny) onDeny();
        });
        
        buttonContainer.appendChild(denyButton);
    }
    
    modalContent.appendChild(messageElement);
    modalContent.appendChild(buttonContainer);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
}

function initSpeech() {
    speechSynthesis.onvoiceschanged = function() {
        voices = speechSynthesis.getVoices();
        
        // Liste alle verfügbaren Stimmen zur Überprüfung in der Konsole
        console.log("Verfügbare Stimmen:", voices);
        
        // Wähle eine weibliche englische Stimme aus (priorisiere weibliche Stimmen)
        selectedVoice = voices.find(voice => 
            voice.lang.includes('en') && voice.name.includes('Female')
        ) || voices.find(voice => voice.lang.includes('en'));
        
        // Gib die gewählte Stimme aus
        console.log("Gewählte Stimme:", selectedVoice);
    };
    
    // Lade die Stimmen sofort, falls sie schon verfügbar sind
    voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
        // Liste alle Stimmen zur Überprüfung in der Konsole
        console.log("Verfügbare Stimmen:", voices);
        
        selectedVoice = voices.find(voice => 
            voice.lang.includes('en') && voice.name.includes('Female')
        ) || voices.find(voice => voice.lang.includes('en'));
        
        // Gib die gewählte Stimme aus
        console.log("Gewählte Stimme:", selectedVoice);
    }
}

// Wort vorlesen
function speakWord(text, lang = 'en-US') {
    if (!speechSynthesis) {
        console.error("SpeechSynthesis nicht unterstützt");
        return;
    }
    
    // Aktuelle Sprachausgabe stoppen
    speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9; // Geschwindigkeit (0.1-10)
    utterance.pitch = 1; // Tonhöhe (0-2)
    
    if (selectedVoice) {
        utterance.voice = selectedVoice;
    }
    
    speechSynthesis.speak(utterance);
}

// Aktuelles Wort vorlesen
function speakCurrentWord() {
    if (currentChapter.length > 0 && currentIndex < currentChapter.length) {
        const currentWord = currentChapter[currentIndex].english;
        speakWord(currentWord);
    }
}

function loadCSVFile() {
    fetch('oxford.csv')
        .then(response => {
            if (!response.ok) throw new Error('CSV-Datei nicht gefunden');
            return response.text();
        })
        .then(data => {
            Papa.parse(data, {
                complete: function(results) {
                    vocabData = results.data
                        .filter(row => row.length >= 3 && row[0] && row[1] && row[2])
                        .map(row => ({
                            english: row[0].trim(),
                            german: row[1].trim(),
                            arabic: row[2].trim()
                        }));
    
                    if (vocabData.length > 0) {
                        document.getElementById('statusMessage').textContent = 
                            `${vocabData.length} Vokabeln geladen!`;
                        createChapters();
                        buildChapterSelect();
                        loadChapter(1);
                    } else {
                        document.getElementById('statusMessage').textContent = 
                            "Keine gültigen Vokabeln gefunden";
                    }
                },
                error: function(error) {
                    document.getElementById('statusMessage').textContent = 
                        "Fehler beim Lesen der CSV: " + error.message;
                },
                delimiter: " ",
                skipEmptyLines: true
            });
        })
        .catch(error => {
            document.getElementById('statusMessage').textContent = 
                "Fehler: " + error.message;
            console.error('Fehler:', error);
        });
}

function createChapters() {
    chapters = {};
    originalChapters = {};
    const totalChapters = Math.ceil(vocabData.length / chapterSize);
    
    for (let i = 0; i < totalChapters; i++) {
        const start = i * chapterSize;
        const end = start + chapterSize;
        originalChapters[i + 1] = vocabData.slice(start, end);
        chapters[i + 1] = originalChapters[i + 1].filter(word => 
            !knownWords.includes(word.english)
        );
    }
}

function buildChapterSelect() {
    const select = document.getElementById('chapter');
    select.innerHTML = '<option value="" disabled selected>Bitte auswählen...</option>';
    
    const sortedChapterNums = Object.keys(chapters).sort((a, b) => {
        return getChapterCompletion(a) - getChapterCompletion(b);
    });
    
    for (const chapterNum of sortedChapterNums) {
        const option = document.createElement('option');
        option.value = chapterNum;
        const remaining = chapters[chapterNum].length;
        const total = originalChapters[chapterNum].length;
        const completion = Math.round(((total - remaining) / total) * 100);
        
        option.text = `Kapitel ${chapterNum} (${remaining}/${total})`;
        option.dataset.completion = completion;
        
        if (remaining === 0) {
            option.classList.add('chapter-completed');
        }
        
        select.appendChild(option);
    }
}

function getChapterCompletion(chapterNum) {
    const total = originalChapters[chapterNum].length;
    const remaining = chapters[chapterNum].length;
    return ((total - remaining) / total) * 100;
}

function updateChapterCompletion(chapterNum) {
    const completion = getChapterCompletion(chapterNum);
    const completionText = document.getElementById('completionText');
    const completionFill = document.getElementById('completionFill');
    
    if (chapterNum) {
        document.getElementById('chapterCompletion').style.display = 'flex';
        completionText.textContent = `${Math.round(completion)}%`;
        completionFill.style.width = `${completion}%`;
        
        const option = document.querySelector(`#chapter option[value="${chapterNum}"]`);
        if (option) {
            const remaining = chapters[chapterNum].length;
            const total = originalChapters[chapterNum].length;
            option.text = `Kapitel ${chapterNum} (${remaining}/${total})`;
            option.dataset.completion = completion;
            
            if (remaining === 0) {
                option.classList.add('chapter-completed');
            } else {
                option.classList.remove('chapter-completed');
            }
        }
    } else {
        document.getElementById('chapterCompletion').style.display = 'none';
    }
}

function loadChapter(chapterNum = 1) {
    if (!chapters[chapterNum]) return;
    
    currentChapter = chapters[chapterNum];
    currentIndex = 0;
    showingTranslation = false;
    searchMode = false;
    document.getElementById('flashcard').classList.remove('flipped');
    updateFlashcard();
    updateChapterCompletion(chapterNum);
}

function updateFlashcard() {
    const wordElement = document.getElementById('word');
    const translationElement = document.getElementById('translation');
    const flashcard = document.getElementById('flashcard');

    let currentWord = null;
    
    if (searchMode && searchResults.length > 0) {
        currentWord = searchResults[currentIndex];
    } else if (!searchMode && currentChapter.length > 0) {
        currentWord = currentChapter[currentIndex];
    }

    if (currentWord) {
        wordElement.textContent = currentWord.english;
        if (showingTranslation) {
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
        wordElement.textContent = searchMode ? "Keine Suchergebnisse" : "Keine Vokabeln verfügbar";
        translationElement.textContent = "";
        flashcard.style.display = 'none';
    }
    
    updateProgress();
}

function toggleTranslation() {
    const flashcard = document.getElementById('flashcard');
    const translationElement = document.getElementById('translation');
    
    let currentWord;
    if (searchMode && searchResults.length > 0) {
        currentWord = searchResults[currentIndex];
    } else if (currentChapter.length > 0) {
        currentWord = currentChapter[currentIndex];
    } else {
        return;
    }

    if (!showingTranslation) {
        translationElement.innerHTML = `
            <div><strong>${currentWord.german}</strong></div>
            <div style="margin-top: 5px;">${currentWord.arabic}</div>
        `;
        flashcard.classList.add('flipped');
    } else {
        translationElement.innerHTML = '';
        flashcard.classList.remove('flipped');
    }
    
    showingTranslation = !showingTranslation;
}

function nextCard() {
    if (searchMode) {
        if (currentIndex < searchResults.length - 1) {
            currentIndex++;
            updateFlashcard();
        } else {
            showModal("Ende der Suchergebnisse erreicht!", null);
        }
    } else {
        if (currentIndex < currentChapter.length - 1) {
            currentIndex++;
            updateFlashcard();
        } else {
            showModal("Ende des Kapitels erreicht!", null);
        }
    }
}

function previousCard() {
    if (currentIndex > 0) {
        currentIndex--;
        updateFlashcard();
    } else {
        showModal("Dies ist die erste Vokabel!", null);
    }
}

function markAsKnown() {
    let currentWord;
    if (searchMode && searchResults.length > 0) {
        currentWord = searchResults[currentIndex].english;
    } else if (currentChapter.length > 0) {
        currentWord = currentChapter[currentIndex].english;
    } else {
        return;
    }
        
    if (!knownWords.includes(currentWord)) {
        knownWords.push(currentWord);
        localStorage.setItem('knownWords', JSON.stringify(knownWords));
        updateKnownWordsList();
        
        if (searchMode) {
            searchResults.splice(currentIndex, 1);
            if (currentIndex >= searchResults.length && searchResults.length > 0) {
                currentIndex = Math.max(0, searchResults.length - 1);
            }
        } else {
            currentChapter.splice(currentIndex, 1);
            if (currentIndex >= currentChapter.length && currentChapter.length > 0) {
                currentIndex = Math.max(0, currentChapter.length - 1);
            }
        }
        
        createChapters();
        const currentChapterNum = document.getElementById('chapter').value;
        buildChapterSelect();
        
        if (!searchMode && currentChapterNum) {
            loadChapter(parseInt(currentChapterNum));
        }
        
        updateFlashcard();
    }
}

function updateKnownWordsList() {
    const knownWordsList = document.getElementById('knownWordsList');
    const knownWordsCount = document.getElementById('knownWordsCount');
    const searchTerm = document.getElementById('knownWordsSearchInput').value.toLowerCase();
    
    const filteredWords = knownWords.filter(word => 
        word.toLowerCase().includes(searchTerm)
    );
    
    knownWordsList.innerHTML = '';
    knownWordsCount.textContent = knownWords.length;
    
    if (filteredWords.length === 0) {
        const li = document.createElement('li');
        li.textContent = "Keine Ergebnisse";
        li.className = 'no-results';
        knownWordsList.appendChild(li);
        return;
    }
    
    filteredWords.forEach(word => {
        const li = document.createElement('li');
        li.className = 'known-word-item';
        
        const wordSpan = document.createElement('span');
        wordSpan.textContent = word;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-known-word';
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.title = 'Wort wieder lernen';
        removeBtn.onclick = () => removeKnownWord(word);
        
        li.appendChild(wordSpan);
        li.appendChild(removeBtn);
        knownWordsList.appendChild(li);
    });
}

function removeKnownWord(word) {
    showModal(`"${word}" wirklich wieder lernen?`, () => {
        knownWords = knownWords.filter(w => w !== word);
        localStorage.setItem('knownWords', JSON.stringify(knownWords));
        updateKnownWordsList();
        createChapters();
        
        const currentChapterNum = document.getElementById('chapter').value;
        buildChapterSelect();
        
        if (!searchMode && currentChapterNum) {
            loadChapter(parseInt(currentChapterNum));
        }
    });
}

function removeAllKnownWords() {
    showModal("Alle gewussten Wörter entfernen?", () => {
        knownWords = [];
        localStorage.setItem('knownWords', JSON.stringify(knownWords));
        updateKnownWordsList();
        createChapters();
        buildChapterSelect();
        
        const currentChapterNum = document.getElementById('chapter').value;
        if (currentChapterNum) {
            loadChapter(parseInt(currentChapterNum));
        }
    });
}

function exportKnownWords() {
    const blob = new Blob([knownWords.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gewusste-woerter.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function toggleKnownWords() {
    const list = document.getElementById('knownWordsList');
    const icon = document.getElementById('knownWordsToggleIcon');
    
    if (list.style.display === 'none') {
        list.style.display = 'block';
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
    } else {
        list.style.display = 'none';
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
    }
}

function updateProgress() {
    let progress;
    if (searchMode) {
        progress = searchResults.length > 0 ? ((currentIndex + 1) / searchResults.length) * 100 : 0;
    } else {
        progress = currentChapter.length > 0 ? ((currentIndex + 1) / currentChapter.length) * 100 : 0;
    }
    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('progress-text').textContent = `${Math.round(progress)}%`;
}

function searchWords() {
    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    
    if (!searchTerm) {
        const currentChapterNum = document.getElementById('chapter').value;
        if (currentChapterNum) loadChapter(parseInt(currentChapterNum));
        return;
    }

    const rawResults = vocabData.filter(word => {
        return (
            (word.english && word.english.toLowerCase().includes(searchTerm)) ||
            (word.german && word.german.toLowerCase().includes(searchTerm)) ||
            (word.arabic && word.arabic.toLowerCase().includes(searchTerm))
        );
    });

    searchResults = rawResults.filter(word => 
        !knownWords.some(known => 
            known.toLowerCase() === word.english.toLowerCase()
        )
    );

    if (searchResults.length > 0) {
        searchMode = true;
        currentIndex = 0;
        showingTranslation = false;
        document.getElementById('flashcard').classList.remove('flipped');
        updateFlashcard();
        document.getElementById('statusMessage').textContent = 
            `${searchResults.length} Ergebnisse`;
    } else {
        document.getElementById('statusMessage').textContent = 
            "Keine Treffer";
        document.getElementById('flashcard').style.display = 'none';
    }
}

// Event Listener
document.addEventListener('DOMContentLoaded', function() {
    initSpeech();
    loadCSVFile();
    
    const knownWordsList = document.getElementById('knownWordsList');
    knownWordsList.style.display = 'none';
    document.getElementById('knownWordsToggleIcon').classList.add('fa-chevron-up');
    
    // Event Listeners hinzufügen
    document.getElementById('searchButton').addEventListener('click', searchWords);
    document.getElementById('searchInput').addEventListener('keyup', function(e) {
        if (e.key === 'Enter') searchWords();
    });
    
    document.getElementById('knownWordsSearchInput').addEventListener('input', function() {
        updateKnownWordsList();
    });
    
    document.getElementById('chapter').addEventListener('change', function() {
        const selected = this.value;
        if (selected) loadChapter(parseInt(selected));
    });
    
    document.getElementById('flashcard').addEventListener('click', toggleTranslation);
    document.getElementById('nextBtn').addEventListener('click', nextCard);
    document.getElementById('backBtn').addEventListener('click', previousCard);
    document.getElementById('knowBtn').addEventListener('click', markAsKnown);
    document.getElementById('speakBtn').addEventListener('click', speakCurrentWord);
    document.getElementById('toggleKnownWordsBtn').addEventListener('click', toggleKnownWords);
    document.getElementById('removeAllKnownWordsBtn').addEventListener('click', removeAllKnownWords);
    document.getElementById('exportKnownWordsBtn').addEventListener('click', exportKnownWords);
    
    // Initial bekannte Wörter laden
    updateKnownWordsList();
});