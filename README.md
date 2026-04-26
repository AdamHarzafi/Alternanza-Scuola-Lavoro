# 📋 Registro FSL Harzafi
### Portale Ufficiale per il Monitoraggio delle Ore di Alternanza Scuola-Lavoro

<div align="center">

[![Stato](https://img.shields.io/badge/Stato-Online%20%F0%9F%9F%A2-brightgreen?style=for-the-badge)](https://adamharzafi.github.io/Alternanza-Scuola-Lavoro/)
[![Licenza](https://img.shields.io/badge/Licenza-Elastic%20License-blue?style=for-the-badge)](#licenza)
[![WCAG](https://img.shields.io/badge/Accessibilit%C3%A0-WCAG%202.1%20AA-orange?style=for-the-badge)](https://adamharzafi.github.io/Alternanza-Scuola-Lavoro/accessibilita.html)
[![Firebase](https://img.shields.io/badge/Backend-Firebase-FFCA28?style=for-the-badge&logo=firebase)](https://firebase.google.com/)

</div>

---

## 📖 Indice

- [Panoramica](#panoramica)
- [Funzionalità Principali](#funzionalità-principali)
- [Tecnologie Utilizzate](#tecnologie-utilizzate)
- [Struttura del Progetto](#struttura-del-progetto)
- [Sicurezza](#sicurezza)
- [Accessibilità](#accessibilità)
- [Documentazione Legale](#documentazione-legale)
- [Autore](#autore)
- [Licenza](#licenza)

---

## 🎯 Panoramica

Il **Registro FSL Harzafi** è un'applicazione web istituzionale sviluppata per l'**ITIS Amedeo Avogadro di Torino**, con lo scopo di digitalizzare e semplificare la gestione dei Percorsi per le Competenze Trasversali e l'Orientamento (PCTO, ex Alternanza Scuola-Lavoro) per l'anno scolastico **2025/2026**.

La piattaforma fornisce un'interfaccia moderna e intuitiva che permette a studenti, docenti tutor e personale amministrativo di accedere, monitorare e gestire in tempo reale le attività formative extrascolastiche richieste dal Ministero dell'Istruzione e del Merito (MIM).

> **Nota:** Questo è un progetto scolastico ufficiale, sviluppato come elaborato personale nell'ambito del percorso informatico della Classe 3°A dell'ITIS Avogadro.

---

## ✨ Funzionalità Principali

### 👨‍🎓 Per gli Studenti
- **Dashboard Personale** — Visualizzazione in tempo reale delle ore FSL accumulate e del progresso verso il target annuale
- **Timeline Formativa** — Storico cronologico di tutti gli eventi e le attività validate
- **Certificati & Attestati** — Consultazione e download degli attestati ottenuti (Cisco, Sicurezza D.Lgs 81/08, HackersGen, ecc.)
- **Profilo Harzafi ID** — Identificativo personale per gli accessi fisici in azienda

### 👨‍🏫 Per i Docenti Tutor
- **Gestione Classi** — Panoramica dello stato FSL di tutti gli studenti assegnati
- **Validazione Ore** — Approvazione e registrazione delle attività formative completate
- **Note Valutative** — Inserimento di feedback e commenti per ogni studente

### 🔐 Sistema di Sicurezza
- **Autenticazione Firebase** — Login sicuro con Google Workspace for Education (SSO istituzionale)
- **Protezione Anti-Bruteforce** — Rate limiting multi-livello (client + server Firebase)
- **Cloudflare Turnstile** — Protezione avanzata contro bot e attacchi DDoS
- **Reset Password via Email** — Flusso sicuro di recupero credenziali tramite Firebase

---

## 🛠️ Tecnologie Utilizzate

| Categoria | Tecnologia | Scopo |
|---|---|---|
| **Frontend** | HTML5, CSS3, JavaScript (ES6+) | Interfaccia utente |
| **Font** | Google Fonts (Inter) | Tipografia |
| **Backend/DB** | Firebase Firestore | Database in tempo reale |
| **Autenticazione** | Firebase Authentication | Login e gestione sessioni |
| **Storage** | Firebase Storage | Archiviazione documenti/attestati |
| **Sicurezza** | Cloudflare Turnstile | Protezione anti-bot |
| **Email** | EmailJS | Notifiche e OTP transazionali |
| **Hosting** | GitHub Pages | Distribuzione statica |

---

## 📁 Struttura del Progetto

```
Alternanza-Scuola-Lavoro/
│
├── 📄 index.html              # Landing page + sistema di login
├── 📄 privacy.html            # Informativa Privacy (GDPR)
├── 📄 termini.html            # Termini di Servizio
├── 📄 accessibilita.html      # Dichiarazione di Accessibilità WCAG 2.1
├── 📄 reset-password.html     # Pagina di reset password Firebase
├── 📄 404.html                # Pagina di errore personalizzata
│
├── 🎨 style.css               # Stili globali del portale principale
├── 🎨 legal.css               # Stili pagine legali (Privacy, Termini)
├── 🎨 accessibilita.css       # Stili pagina accessibilità
├── 🎨 shared.css              # Stili principali identici (Privacy, Termini)
│
├── ⚙️ main.js                 # Logica principale (auth, dashboard, dati)
├── ⚙️ legal.js                # Logica pagine legali (animazioni, counter)
├── ⚙️ accessibilita.js        # Logica pagina accessibilità
│
├── 📁 IMMAGINI/               # Asset grafici e loghi istituzionali
│   ├── LOGO-HARZAFI.png
│   ├── HARZAFI-LOGO-FOR-APPLE.png
│   ├── LOGO-MIM.png
│   └── [loghi partner...]
│
├── 📋 README.md               # Questo file
├── 📜 LICENSE.md              # Licenza Elastic — © 2026 Adam Harzafi
└── 🔒 SECURITY.md             # Policy di Responsible Disclosure
```

---

## 🔒 Sicurezza

La sicurezza dei dati degli studenti è una priorità assoluta. Il progetto adotta le seguenti misure:

- **Regole Firestore granulari** — Ogni collezione ha regole di accesso specifiche: i dati PCTO sono accessibili solo agli utenti autenticati; i dati anagrafici pubblici sono in sola lettura
- **API Key con restrizioni di dominio** — La chiave API Firebase è limitata ai soli domini ufficiali del progetto tramite Google Cloud Console
- **HTTPS obbligatorio** — GitHub Pages forza il protocollo sicuro su tutto il traffico
- **Nessun dato sensibile in chiaro** — Le password non vengono mai gestite direttamente (delegate a Firebase Auth)

Per segnalare una vulnerabilità, consulta [`SECURITY.md`](SECURITY.md) e segui la procedura di **Responsible Disclosure**.

---

## ♿ Accessibilità

Il portale è progettato per essere conforme alle **WCAG 2.1 Livello AA** e alla **Legge 4/2004** (Legge Stanca):

- ✅ Testo alternativo su tutte le immagini
- ✅ Navigazione completa da tastiera
- ✅ Rapporto di contrasto minimo 4.5:1
- ✅ Struttura semantica HTML5 (H1-H6 gerarchici)
- ✅ Compatibile con screen reader (VoiceOver, NVDA, JAWS)
- ✅ Ridimensionamento testo fino al 200% senza perdita di contenuto

Per la dichiarazione completa: [`accessibilita.html`](https://adamharzafi.github.io/Alternanza-Scuola-Lavoro/accessibilita.html)

---

## 📚 Documentazione Legale

| Documento | Descrizione |
|---|---|
| [Privacy Policy](https://adamharzafi.github.io/Alternanza-Scuola-Lavoro/privacy.html) | Informativa GDPR sul trattamento dei dati personali |
| [Termini di Servizio](https://adamharzafi.github.io/Alternanza-Scuola-Lavoro/termini.html) | Condizioni generali d'uso della piattaforma |
| [Dichiarazione di Accessibilità](https://adamharzafi.github.io/Alternanza-Scuola-Lavoro/accessibilita.html) | Conformità WCAG 2.1 e Legge 4/2004 |
| [Security Policy](SECURITY.md) | Procedura di segnalazione vulnerabilità |
| [Licenza](LICENSE.md) | Elastic License — tutti i diritti riservati |

---

## 👤 Autore

**Harzafi Adam**
Classe 3°A Informatica — ITIS Amedeo Avogadro, Torino
Anno Scolastico 2025/2026

| Contatto | Riferimento |
|---|---|
| 📧 Email Supporto | [harzafi.support@gmail.com](mailto:harzafi.support@gmail.com) |
| 🏫 Email Istituzionale | [s11205413d@studenti.itisavogadro.it](mailto:s11205413d@studenti.itisavogadro.it) |
| 🌐 Portale Live | [adamharzafi.github.io/Alternanza-Scuola-Lavoro](https://adamharzafi.github.io/Alternanza-Scuola-Lavoro/) |

---

## 📜 Licenza

Copyright © 2026 **Adam Harzafi** — Tutti i diritti riservati.

Questo progetto è distribuito sotto **Elastic License**. È vietata la riproduzione, clonazione o redistribuzione del codice sorgente, dell'interfaccia grafica e delle architetture logiche senza il consenso esplicito e scritto dell'autore.

Consulta [`LICENSE.md`](LICENSE.md) per i termini completi.

---

<div align="center">

Sviluppato con ❤️ per l'**ITIS Amedeo Avogadro di Torino**

*Registro FSL Harzafi — Portale Ufficiale © 2026 — Tutti i diritti riservati*

</div>
