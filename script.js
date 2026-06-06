const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('navLinks');

hamburger.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});

navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
  });
});


/*navigation scroll */
const navbar = document.getElementById('navbar');

window.addEventListener('scroll', () => {
  if (window.scrollY > 20) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});


/* reveal animations while scrolling*/
const fadeElements = document.querySelectorAll('.fade-up');

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, index) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.classList.add('visible');
      }, index * 80);

      revealObserver.unobserve(entry.target);
    }
  });
}, {
  threshold: 0.12  
});

fadeElements.forEach(el => revealObserver.observe(el));


/* form submission*/
const contactForm = document.getElementById('contactForm');
const submitBtn   = document.getElementById('submitBtn');

contactForm.addEventListener('submit', (event) => {
  event.preventDefault();

  // Confirm state
  submitBtn.textContent        = '✓ Message Sent!';
  submitBtn.style.background   = 'var(--bark)';
  submitBtn.disabled           = true;

  // Reset after 3 seconds
  setTimeout(() => {
    submitBtn.textContent      = 'Send Message';
    submitBtn.style.background = '';
    submitBtn.disabled         = false;
    contactForm.reset();
  }, 3000);
});