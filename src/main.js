import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import { installIosScrollLock } from './utils/iosScrollLock.js';

installIosScrollLock();

createApp(App).mount('#app');
