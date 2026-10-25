# Sicurezza · Harzafi FSL

Come segnalare un problema e collaborare alla sua risoluzione senza esporre dati o interrompere il servizio.

**Contatto dedicato:** [harzafi.support@gmail.com](mailto:harzafi.support@gmail.com)

**Gestione del progetto:** Harzafi Adam

> Non pubblicare vulnerabilità ancora sfruttabili, credenziali o dati personali in issue, commenti, repository o schermate condivise.

## Indice

- [Segnalare un problema](#segnalare-un-problema)
- [Informazioni utili](#informazioni-utili)
- [Ambito della segnalazione](#ambito-della-segnalazione)
- [Verifiche responsabili](#verifiche-responsabili)
- [Presa in carico](#presa-in-carico)
- [Versioni e distribuzioni](#versioni-e-distribuzioni)
- [Limiti delle garanzie](#limiti-delle-garanzie)
- [Assistenza e privacy](#assistenza-e-privacy)

## Segnalare un problema

Inviare un’email a **harzafi.support@gmail.com** con oggetto:

```text
[Sicurezza Harzafi] Breve descrizione del problema
```

Descrivere il problema con il minimo necessario per comprenderlo. Per una prima segnalazione non occorre dimostrarne l’impatto su dati reali né allegare un’esportazione del database.

Se si incontrano accidentalmente dati non propri, interrompere la verifica. Comunicare la pagina, l’ora indicativa e il tipo di esposizione, senza continuare a consultare o copiare i dati.

### Se sono coinvolte credenziali

Non incollare password, token o chiavi private nell’email. Indicare il tipo di credenziale e dove risulta esposta, oscurandone il valore. Se la credenziale appartiene al proprio account, provvedere alla sua revoca o sostituzione attraverso il servizio competente.

## Informazioni utili

| Informazione | Cosa indicare |
| --- | --- |
| Componente | Pagina, file, URL o funzione coinvolta. |
| Momento | Data, ora indicativa e fuso orario. |
| Ambiente | Browser, sistema operativo e dispositivo, quando rilevanti. |
| Comportamento | Risultato osservato e risultato atteso. |
| Riproduzione | Passaggi minimi, preferibilmente su una copia locale con dati fittizi. |
| Impatto | Quali dati o funzioni potrebbero essere coinvolti, distinguendo osservazioni e ipotesi. |
| Prove | Schermate oscurate o un esempio minimo, senza dati personali o segreti. |

Non è necessario compilare ogni voce. Una descrizione breve e riproducibile è più utile di una grande quantità di log non filtrati.

## Ambito della segnalazione

Sono pertinenti i problemi nel codice di Harzafi o nella sua integrazione con i servizi utilizzati, per esempio:

- accesso o visualizzazione inattesa di dati;
- gestione delle sessioni e percorsi di autenticazione;
- trattamento degli input e inserimento dei contenuti nell’interfaccia;
- esposizione involontaria di informazioni nelle risorse distribuite;
- configurazioni dei servizi del progetto che sembrano consentire operazioni non previste.

Il repository contiene uno snapshot completo delle regole Firestore in [`firebase/firestore.rules`](firebase/firestore.rules). I registri del progetto riportano una verifica della copia attiva il 20 settembre 2026; è una verifica storica e non dimostra che la Console Firebase usi ancora le stesse regole. Il codice del Worker email e le regole Storage non sono inclusi. Per confermare la configurazione attuale serve confrontare lo snapshot con Firebase Console.

### Regole dei profili e autorizzazione degli account

Nel codice aggiornato, i client non possono creare o modificare documenti in `studenti` e `docenti`: l’inserimento e la gestione degli account restano amministrati. Il profilo è leggibile dal titolare autenticato; i docenti abilitati possono leggere i profili degli studenti necessari al registro di classe. Login e dashboard verificano il profilo dopo l’autenticazione e le regole richiedono un collegamento valido al profilo prima di accedere ai dati del registro. Le richieste di accesso e recupero password mostrano risposte generiche per non rivelare se un indirizzo è presente nella lista o associato a un account. Per uniformare anche le risposte dell’API Firebase, verificare che sia attiva la protezione dall’enumerazione delle email in Firebase Console → Authentication → Impostazioni → Azioni utente; la documentazione Firebase la raccomanda e segnala che può essere preattiva nei progetti recenti ([guida Firebase](https://firebase.google.com/docs/auth/cpp/password-auth#recommended_enable_email_enumeration_protection)).

Le regole aggiornate per le attività verificano che la data esista nel calendario gregoriano e che la durata abbia al massimo due decimali. Queste modifiche sono presenti nei file del repository, ma non è stata controllata né aggiornata la configurazione attiva in Firebase Console. Prima di considerarle effettive online, confrontare e pubblicare le regole in [`firebase/firestore.rules`](firebase/firestore.rules), quindi verificare la configurazione attiva. L’autorizzazione ai registri e alle attività personali resta separata: si basa sull’UID dell’utente e sul ruolo docente autorizzato.

### Servizi esterni

Le infrastrutture dei fornitori non sono gestite da Harzafi. Per un difetto della piattaforma del fornitore utilizzare il suo canale ufficiale di sicurezza; per un dubbio sull’integrazione di Harzafi scrivere al contatto indicato sopra.

Questa procedura non autorizza test su infrastrutture esterne, domini scolastici o account di altre persone.

## Verifiche responsabili

Per lavorare su un problema:

1. Preferire una copia locale con dati sintetici e servizi di test.
2. Limitarsi alla verifica minima necessaria.
3. Chiedere un accordo scritto prima di qualsiasi test attivo sul servizio pubblicato.
4. Interrompere le prove se emergono dati non propri o un rischio per la disponibilità.
5. Condividere privatamente la segnalazione e concordare l’eventuale divulgazione.

Non effettuare:

- accesso, modifica, cancellazione o esportazione di dati altrui;
- tentativi ripetuti di password, abuso dei recuperi o invii massivi di email;
- scansioni automatizzate, fuzzing o prove di carico senza accordo preventivo;
- interruzioni del servizio o sfruttamento del problema oltre la verifica concordata;
- aggiramento delle restrizioni imposte da un istituto o da un fornitore.

La disponibilità pubblica del codice non costituisce autorizzazione a eseguire questi test sui sistemi collegati.

## Presa in carico

Il percorso previsto è:

1. **Ricezione:** lettura della segnalazione ed eventuale richiesta di chiarimenti.
2. **Valutazione:** verifica del comportamento e dell’impatto, con priorità alle esposizioni di dati e agli accessi non previsti.
3. **Intervento:** individuazione della correzione o del contenimento appropriato.
4. **Verifica:** controllo della soluzione nell’ambiente interessato.
5. **Riscontro:** comunicazione dell’esito, nei limiti delle informazioni condivisibili.

Gli obiettivi indicativi di presa in carico sono:

| Fase | Obiettivo |
| --- | --- |
| Conferma di ricezione | Entro 48 ore. |
| Prima valutazione | Entro 5 giorni. |
| Primo aggiornamento sull’esito | Entro 10 giorni. |
| Correzione, se confermata | Obiettivo di 30 giorni, da rivalutare in base a gravità e complessità. |

Sono obiettivi organizzativi, non un SLA: dipendenze esterne e complessità possono richiedere tempi diversi. Se non arriva risposta, inviare un sollecito nella stessa conversazione, senza pubblicare le informazioni riservate.

Un eventuale riconoscimento pubblico del contributo viene concordato con chi segnala. Non è previsto in questo documento un programma di ricompense.

## Versioni e distribuzioni

Il progetto viene aggiornato in modo continuativo. La revisione pubblicata può non coincidere con l’ultimo aggiornamento di `main`: indicare sempre l’URL interessato e, se disponibile, il riferimento della revisione.

| Copia | Riferimento per la segnalazione |
| --- | --- |
| Distribuzione gestita da Harzafi | URL e momento in cui è stato osservato il problema. |
| Sorgenti correnti | File coinvolto e revisione Git, se nota. |
| Copia precedente | Revisione e indicazione se il problema compare anche nella versione corrente. |
| Fork o installazione di terzi | Contattare chi li gestisce; segnalare a Harzafi l’eventuale difetto condiviso nei sorgenti. |

## Limiti delle garanzie

Questa procedura descrive come segnalare problemi: non certifica la sicurezza del portale.

In particolare, non prova la presenza o l’efficacia di crittografia end-to-end, limitazione delle richieste lato server, verifica server dei token anti-bot, regole Firebase, backup o procedure di ripristino. Questi aspetti richiedono controlli specifici sui servizi e sui processi effettivamente utilizzati.

La presenza di controlli nel frontend non basta a dimostrare che i dati siano protetti da accessi non autorizzati.

## Assistenza e privacy

- Per difficoltà di accesso o domande d’uso: [Supporto](supporto.html).
- Per comprendere il trattamento dei dati: [Norme sulla privacy](privacy.html).
- Per conoscere il progetto: [README.md](README.md).
- Per le condizioni sul codice: [LICENSE.md](LICENSE.md).

Harzafi è un progetto personale e indipendente. Questa policy non è una procedura ufficiale dell’istituto.
