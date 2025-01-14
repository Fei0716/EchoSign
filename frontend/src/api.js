import axios from 'axios'

const host = "10.131.73.75";
const api = axios.create({
    // baseURL: "http://localhost:3000/api/v1/"
    baseURL: `http://${host}:3000/api/v1/`
})


export default api;