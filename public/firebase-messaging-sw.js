importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCX9LoBWkMNl9y8fS3JwSYDiMyzV_oEDAU",
  authDomain: "marble-flow.firebaseapp.com",
  projectId: "marble-flow",
  storageBucket: "marble-flow.firebasestorage.app",
  messagingSenderId: "993030163339",
  appId: "1:993030163339:web:53c78a5e3dcd80dd0b7d8e"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  if (payload.notification) {
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
      body: payload.notification.body,
      icon: '/logo.png',
      data: payload.data
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  }
});
