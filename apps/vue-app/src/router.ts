import { createRouter, createWebHashHistory } from 'vue-router';
import Home from './pages/Home.vue';
import About from './pages/About.vue';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/',      name: 'home',  component: Home },
    { path: '/about', name: 'about', component: About },
  ],
});

export default router;
