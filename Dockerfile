# --- UI build stage ---------------------------------------------------------
# `atlas-ui/react/dist` is not in version control (and `.dockerignore` excludes it), so the
# bundle has to be produced here. Without this stage the image shipped a UI with no
# manifest and served a blank page.
FROM node:22-slim AS ui

WORKDIR /ui
# deps first so a source-only change does not re-run `npm ci`
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build

# --- runtime -----------------------------------------------------------------
FROM python:3.11-slim

# Python env vars
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# env
ENV HOME="/app" \
    XDG_CONFIG_HOME="/app" \
    XDG_DATA_HOME="/app"

# deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# wd
WORKDIR /app

# copy
COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# copy to modify on local
COPY . /app_defaults

# the bundle is built in the ui stage above, never copied from the working tree
COPY --from=ui /ui/atlas-ui/react/dist /app_defaults/atlas-ui/react/dist

# encrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# THE EXPOSE!
EXPOSE 42424

# define and command
ENTRYPOINT ["/entrypoint.sh"]
CMD ["python", "__main__.py"]
