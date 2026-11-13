(function(){
    'use strict';
    // Foreground/background-tab notifications. Closed-site delivery requires a configured push server.
    let registration;
    const supported=()=> 'Notification' in window;
    async function enable(){if(!supported())return 'unsupported';const permission=await Notification.requestPermission();if(permission==='granted'&&'serviceWorker'in navigator)registration=await navigator.serviceWorker.register('messages-notification-sw.js');return permission;}
    async function notify(id){if(window.HarzafiMessagePush?.enabled()||!supported()||Notification.permission!=='granted'||!document.hidden)return;const options={body:'Apri Messaggi per leggere la conversazione.',tag:'harzafi-'+id,icon:'IMMAGINI/PROFILO-UTENTE-LOGO.webp',data:{url:new URL('messaggi.html',location.href).href}};try{if(!registration&&'serviceWorker'in navigator)registration=await navigator.serviceWorker.getRegistration();if(registration){await registration.showNotification('Nuovo messaggio · Harzafi FSL',options);return;}const notification=new Notification('Nuovo messaggio · Harzafi FSL',options);notification.onclick=()=>{window.focus();notification.close();};}catch(_){/* Notification support must never interrupt message synchronization. */}}
    window.HarzafiMessageNotifications={enable,notify,supported};
})();
