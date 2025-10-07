<p align="center">
    <a href="https://wippy.ai" target="_blank">
        <picture>
            <source media="(prefers-color-scheme: dark)" srcset="https://github.com/wippyai/.github/blob/main/logo/wippy-text-dark.svg?raw=true">
            <img width="30%" align="center" src="https://github.com/wippyai/.github/blob/main/logo/wippy-text-light.svg?raw=true" alt="Wippy logo">
        </picture>
    </a>
</p>
<h1 align="center">App</h1>
<div align="center">

[![License](https://img.shields.io/github/license/wippyai/app?style=flat-square)](LICENSE)
[![Documentation](https://img.shields.io/badge/documentation-online-brightgreen.svg?style=flat-square)][documentation]

</div>

This repository is your entry point into the Wippy ecosystem.
It’s designed to help you launch a fully functional Wippy instance in minutes,
with everything you need to start building, experimenting, and learning.

Inside, you’ll find a set of example plugins, a user-friendly web interface,
and a built-in tutorial to guide you through the platform’s core features.
The agent system (Keeper) and knowledge base modules are already connected,
so you can focus on your ideas instead of setup.

## What’s Included

Wippy Starter App comes with a comprehensive set of modules and features to help you hit the ground running:

- **Plugin System**  
  Example plugins and a flexible plugin manager are available in `src/app/plugins`, making it easy to extend and customize your application.

- **API Endpoints**  
  Predefined REST endpoints and application logic are included for immediate interaction and rapid prototyping.

- **Authentication & Security**  
  Built-in modules for user authentication, token management, and API protection ensure your app is secure from the start.

- **Web Dashboard & Interactive Tutorial**  
  A modern frontend with an integrated step-by-step tutorial helps you explore Wippy’s capabilities and onboard quickly.

- **Agent System (Keeper)**  
  Automation and orchestration are handled by the Keeper agent framework, enabling advanced workflows and integrations.

- **Knowledge Base**  
  Integrated userspace knowledge management lets you organize, store, and search information right out of the box.

- **Credential & Connection Management**  
  Easily connect to external services with built-in OAuth and credential management modules.

- **Process & Task Management**  
  Support for background jobs, scheduled tasks, and process supervision is included for robust application behavior.

- **Service Contracts**  
  Standardized service definitions and contracts simplify integration and extension of your app’s capabilities.

- **User Components**  
  Templates, notes, and user collections are provided to accelerate prototyping and collaboration.

## Getting Started

1. **Clone this repository**
   ```sh
   git clone https://github.com/wippyai/app.git
   cd app
   ```

2. **Download the Wippy Runtime**  
    Visit the [releases page][runtime-download] to get the latest version of the Wippy Runtime for your operating system.  
    Unzip the downloaded file and place the `wippy` executable in this directory (the same directory as this README).

3. **Install libraries and dependencies**
   ```sh
   ./wippy update
   ```

4. **Start the application**
   ```sh
   ./wippy run
   ```

5. **Open your browser and go to [http://localhost:8080](http://localhost:8080)**  
   Follow the interactive tutorial to get familiar with Wippy.

[documentation]: https://docs.wippy.ai
[releases-page]: https://github.com/wippyai/app/releases
[runtime-download]: https://github.com/wippyai/wippy-releases/releases

## License

This project is licensed under the Apache-2.0 License. See the [LICENSE](LICENSE) file for details.
