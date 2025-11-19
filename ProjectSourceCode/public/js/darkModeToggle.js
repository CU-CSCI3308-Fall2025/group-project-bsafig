document.addEventListener('DOMContentLoaded', () => {
  const link = document.getElementById('darkModeLink');
  const body = document.body;

  link.addEventListener('click', (e) => {
    e.preventDefault();
    body.classList.toggle('dark-mode');
  });
});
