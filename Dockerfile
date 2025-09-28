# Use Node.js 18 with Debian base (better package support than Alpine)
FROM node:18-slim

# Set working directory
WORKDIR /usr/src/app

# Install system dependencies for yt-dlp and ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-full \
    ffmpeg \
    curl \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp using Python virtual environment (handles PEP 668)
RUN python3 -m venv /opt/yt-dlp-venv \
    && /opt/yt-dlp-venv/bin/pip install --no-cache-dir yt-dlp \
    && ln -s /opt/yt-dlp-venv/bin/yt-dlp /usr/local/bin/yt-dlp

# Verify installations
RUN yt-dlp --version && ffmpeg -version

# Copy package files first (for better Docker layer caching)
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application source code
COPY . .

# Create directories for temporary files
RUN mkdir -p /tmp/downloads && chmod 755 /tmp/downloads

# Set Cloud Run environment variables
ENV PORT=8080
ENV NODE_ENV=production

# Non-root user for security (optional but recommended)
RUN groupadd -r nodeuser && useradd -r -g nodeuser nodeuser
RUN chown -R nodeuser:nodeuser /usr/src/app /tmp/downloads
USER nodeuser

# Expose the port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start the application
CMD ["node", "server.js"]
