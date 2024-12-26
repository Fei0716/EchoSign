import {createRouter, createWebHistory} from "vue-router";
import Meeting from "./views/Meeting.vue"
const routes = [
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