// This worker displays only notifications requested by an open Messages page.
// It has no push subscription and cannot receive messages when the site is closed.
self.addEventListener('notificationclick',event=>{
 event.notification.close();const target=new URL('messaggi.html',self.location.href).href;
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{const existing=windows.find(client=>client.url.split('?')[0]===target);if(existing)return existing.focus();return clients.openWindow(target);}));
});
