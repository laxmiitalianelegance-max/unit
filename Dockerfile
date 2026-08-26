FROM docker.io/cloudflare/sandbox:0.12.8-python

# Keep the first execution image focused and reproducible. NumPy, Pandas and
# Matplotlib are already provided by the pinned Cloudflare Python image.
RUN pip3 install --no-cache-dir scikit-learn==1.7.2
