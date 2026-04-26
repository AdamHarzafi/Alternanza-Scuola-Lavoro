# Security Policy — Registro FSL Harzafi

## Versioni Supportate

Il progetto **Registro FSL Harzafi** è un'applicazione web a singola release continuativa (rolling release), distribuita tramite GitHub Pages. Non esiste un sistema di versioni numeriche tradizionale: la versione attiva e supportata è sempre e unicamente quella attualmente pubblicata sul branch `main`.

| Versione / Branch | Supportata         |
| ----------------- | ------------------ |
| `main` (live)     | :white_check_mark: |
| Branch archiviati | :x:                |
| Fork non ufficiali| :x:                |

---

## Segnalazione di una Vulnerabilità

Se hai individuato una vulnerabilità di sicurezza all'interno del portale **Registro FSL Harzafi**, ti chiediamo di seguire la procedura di **Responsible Disclosure** descritta di seguito, astenendoti dal pubblicarla pubblicamente prima che il problema sia stato risolto.

### Come segnalare

Invia una email all'indirizzo del responsabile tecnico del sistema:

📧 **harzafi.support@gmail.com**

### Cosa includere nella segnalazione

Per consentire una valutazione rapida ed efficace, includi nella tua email le seguenti informazioni:

- **Descrizione della vulnerabilità:** una spiegazione chiara e dettagliata del problema riscontrato.
- **Pagina o componente coinvolto:** indica la URL specifica o il file sorgente in cui hai identificato il problema (es. `index.html`, `main.js`, endpoint Firestore, ecc.).
- **Passi per riprodurre il problema:** una sequenza di azioni che permetta di replicare la vulnerabilità in modo verificabile.
- **Impatto stimato:** descrivi quale tipo di danno potrebbe causare l'exploit (es. accesso non autorizzato ai dati, bypass del login, esposizione di dati personali).
- **Eventuali prove:** screenshot, log o Proof of Concept (PoC), se disponibili. Non è obbligatorio ma accelera la verifica.

### Tempistiche di risposta

| Fase                                     | Tempo stimato         |
| ---------------------------------------- | --------------------- |
| Conferma di ricezione della segnalazione | Entro **48 ore**      |
| Valutazione iniziale della vulnerabilità | Entro **5 giorni**    |
| Aggiornamento sullo stato (accettata/rifiutata) | Entro **10 giorni** |
| Rilascio della correzione (se accettata) | Entro **30 giorni**   |

### Cosa aspettarsi

- Se la vulnerabilità viene **accettata**, ti verrà comunicato l'aggiornamento di risoluzione non appena disponibile. Il tuo contributo potrà essere riconosciuto pubblicamente (previo tuo consenso) nel changelog o nella documentazione del progetto.
- Se la vulnerabilità viene **rifiutata** (es. comportamento atteso, fuori scope, già noto), riceverai una spiegazione motivata entro i termini indicati.

---

## Ambito della Policy (Scope)

Questa policy di sicurezza si applica esclusivamente ai componenti sviluppati e mantenuti direttamente nell'ambito di questo progetto:

✅ **In scope:**
- Codice HTML, CSS, JavaScript del frontend (`index.html`, `main.js`, `style.css`, ecc.)
- Logica di autenticazione Firebase (login, reset password, gestione sessione)
- Regole di sicurezza Firestore e Firebase Storage
- Pagine legali e di sistema (`privacy.html`, `termini.html`, `accessibilita.html`, `404.html`)

❌ **Fuori scope:**
- Infrastruttura di Google Firebase / Firestore (segnalare direttamente a [Google](https://bughunters.google.com/))
- Infrastruttura di GitHub Pages (segnalare a [GitHub](https://github.com/security))
- Infrastruttura Cloudflare Turnstile (segnalare a [Cloudflare](https://www.cloudflare.com/disclosure/))
- Vulnerabilità di terze parti non controllate da questo progetto

---

## Comportamenti Vietati

Durante le attività di ricerca delle vulnerabilità, è severamente vietato:

- Accedere, modificare o esfiltrare dati personali di studenti, docenti o personale scolastico.
- Eseguire attacchi di tipo Denial of Service (DoS/DDoS) contro i servizi Firebase o GitHub Pages.
- Effettuare test di sicurezza automatizzati (scanner, fuzzer) senza previo accordo scritto.
- Sfruttare attivamente una vulnerabilità per ottenere accesso non autorizzato al sistema.

---

## Informazioni sul Progetto

| Campo                  | Dettaglio                                      |
| ---------------------- | ---------------------------------------------- |
| **Progetto**           | Registro FSL Harzafi                           |
| **Responsabile tecnico** | Harzafi Adam — Classe 3°A Informatica        |
| **Istituto**           | ITIS Amedeo Avogadro, Torino                   |
| **Anno scolastico**    | 2025/2026                                      |
| **Distribuzione**      | GitHub Pages (sito statico + Firebase backend) |
| **Licenza**            | Elastic License — © 2026 Adam Harzafi          |
