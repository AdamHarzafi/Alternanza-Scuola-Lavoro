const { test } = require('node:test');
const assert = require('node:assert/strict');
const messages = require('../messages-store.js');
test('Messages preserve text and reject empty or overlong payloads', () => {
 assert.equal(messages.messageText('  Ciao!\r\nA domani.  '),'Ciao!\nA domani.');
 assert.throws(()=>messages.messageText(' \n '),{code:'empty-message'});
 assert.throws(()=>messages.messageText('x'.repeat(2001)),{code:'message-too-long'});
 assert.equal(messages.messageText('<script>alert(1)</script>'),'<script>alert(1)</script>');
});
test('Direct conversation keys are deterministic and cannot mix identities', () => {
 assert.equal(messages.conversationId('b','a'),'a~b');
 assert.equal(messages.conversationId('a','b'),'a~b');
 assert.throws(()=>messages.conversationId('a','a'),{code:'invalid-recipient'});
 assert.throws(()=>messages.conversationId('a/b','c'),{code:'invalid-recipient'});
 assert.throws(()=>messages.conversationId('a~b','c'),{code:'invalid-recipient'});
});
test('Messaging clients require a real authenticated user', () => {
 assert.throws(()=>messages.create({},null,()=>null),{code:'account-unavailable'});
 assert.throws(()=>messages.create({},{uid:'anonymous',isAnonymous:true},()=>null),{code:'account-unavailable'});
});
