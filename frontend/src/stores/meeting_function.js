import {defineStore} from 'pinia';
import {watchEffect ,ref, computed} from "vue";

const useMeetingFunctionStore = defineStore("MeetingFunction", ()=>{
//     states
    const isSignLanguageRecognitionActivated  = ref(false);

//     getters


//     actions
    const toggleSignLanguageRecognition = () =>{
        isSignLanguageRecognitionActivated.value = !isSignLanguageRecognitionActivated.value;
    }

    return{
        isSignLanguageRecognitionActivated,
        toggleSignLanguageRecognition,
    }
});

export default useMeetingFunctionStore;