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
    top: 12px;
    left: 50%;
    right: 50%;
    width: max-content;
    z-index: 2;
    display: flex;
    gap: .25rem;
    font-size: 18px;
    justify-content: space-between;
    align-items: center;
    padding: 12px 8px;
    border-radius: .25rem;
  }
</style>