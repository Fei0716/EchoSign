<script setup>
import {onMounted} from "vue";

const emits = defineEmits(['closeNotification'])
onMounted(()=>{
  //remove the notification after a few seconds
  setTimeout(()=>{
    emits('closeNotification');
  }, 4000);
});
</script>

<template>
  <section class="notification-section bg-primary">
    <i class="bi bi-info-circle-fill"></i>
    <slot></slot>
  </section>
</template>

<style scoped>
  .notification-section{
    position: absolute;
    width: 350px;
    top: 12px;
    left: 50%;
    right: 50%;
    transform: translateX(-125px);
    z-index: 1056;
    display: flex;
    gap: .75rem;
    font-size: 18px;
    align-items: center;
    padding: 12px 8px;
    border-radius: .25rem;
  }
</style>