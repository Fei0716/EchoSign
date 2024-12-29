import {createRouter, createWebHistory} from "vue-router";
import Meeting from "./views/Meeting.vue"
import Home from "./views/Home.vue"
const routes = [
    {
        path: "/",
        component: Home,
        name: "Home"
    },
    {
        path: "/meeting/:id",
        component: Meeting,
        name: "Meeting"
    }
];

const router = createRouter({
    history: createWebHistory(),
    routes
});

export default router;