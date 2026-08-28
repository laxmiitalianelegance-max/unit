FROM docker.io/cloudflare/sandbox:0.12.8-python

# Keep the execution image focused and reproducible. NumPy, Pandas and
# Matplotlib are already provided by the pinned Cloudflare Python image.
# defusedxml is installed because openpyxl does not protect XML parsing by
# itself when workbooks come from untrusted uploads.
RUN pip3 install --no-cache-dir \
    scikit-learn==1.7.2 \
    openpyxl==3.1.5 \
    defusedxml==0.7.1
