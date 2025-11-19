document.addEventListener('DOMContentLoaded', () => {
  const link = document.getElementById('darkModeLink');
  const body = document.body;

  if (localStorage.getItem('darkMode') === 'on') {
    body.classList.add('dark-mode');
  }

  link.addEventListener('click', (e) => {
    e.preventDefault();
    body.classList.toggle('dark-mode');

    // Save current mode
    if (body.classList.contains('dark-mode')) {
      localStorage.setItem('darkMode', 'on');
    } else {
      localStorage.setItem('darkMode', 'off');
    }
  });
});
