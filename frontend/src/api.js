import axios from 'axios'

const host = "192.168.1.29";
const api = axios.create({
    // baseURL: "http://localhost:3000/api/v1/"
    baseURL: `http://${host}:3000/api/v1/`
})


export default api;