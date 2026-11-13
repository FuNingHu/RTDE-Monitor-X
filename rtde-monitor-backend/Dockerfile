FROM python:3.11-alpine

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src .

EXPOSE 52762

ENTRYPOINT ["python3", "-u", "main.py", "--host", "0.0.0.0", "--port", "52762"]
