# Conflict-Free College Timetable Generator Using Relations

A responsive, light-themed React + TypeScript timetable planner applying sets, relations, constraints, and backtracking.

## Publish a public HTTPS website with GitHub Pages

The included GitHub Actions workflow builds and publishes the site to GitHub Pages whenever changes are pushed to the `main` branch.

1. Sign in to GitHub and create a **public** repository, for example `relations-timetable-studio`.
2. In this project folder, initialize Git, commit the project files, and push them to that repository's `main` branch. Do not commit `node_modules` or secrets; `.gitignore` excludes build/dependency folders.
3. On GitHub, open the repository's **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
4. Open the repository's **Actions** tab and wait for the **Deploy to GitHub Pages** workflow to complete successfully.
5. Your public, HTTPS website address will be `https://YOUR-GITHUB-USERNAME.github.io/REPOSITORY-NAME/` (replace both uppercase parts with your GitHub username and repository name). You can open and share this link in Chrome on other devices.

The workflow is at `.github/workflows/deploy.yml`. GitHub Pages provides the public HTTPS certificate; the self-signed certificate used by the local development server is not used for the hosted site.

### Google Search

Publishing makes the site reachable by its public link; it does not guarantee immediate appearance in Google Search. After the website is live, add its URL prefix in [Google Search Console](https://search.google.com/search-console), verify ownership using the available verification method, and request indexing for the deployed homepage. Google decides whether and when to index a site.

## Run locally

1. Install Node.js (version 20 or newer).
2. In this folder, run `npm install`.
3. Run `npm run dev` and open `https://localhost:5173/`.

The development server uses a generated self-signed HTTPS certificate. Your browser may show a certificate warning because this certificate is only for local development.

Your data is stored in the current browser's local storage. It is not shared between browsers, devices, or users. Use **Export data** to save a portable JSON backup and **Import data** to restore one.

## Scheduling model

Add your own groups, subjects, faculty, classrooms, and day-specific time windows. Mark time windows as breaks to exclude them from scheduling. Faculty and rooms can have day and time-window availability limits. The generator uses backtracking, prioritizes sessions with fewer candidates, and has a 50,000-search-node limit. A schedule is only reported conflict-free after the validator confirms required sessions, availability, working windows, qualifications, capacity, and resource/group overlap rules.

## Limitations

The app runs entirely in the current browser and does not synchronize data. Timetable PDF output uses the browser's print dialog (choose **Save as PDF**). The project brief was supplied without a presentation file, so the academic explanations follow the terminology in the brief and do not claim real-world test results.
