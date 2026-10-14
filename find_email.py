import os
root = r"D:\zoiko-hr-platform"
for dirpath, dirnames, filenames in os.walk(root):
    for f in filenames:
        if "email_sample" in f.lower():
            print(os.path.join(dirpath, f))